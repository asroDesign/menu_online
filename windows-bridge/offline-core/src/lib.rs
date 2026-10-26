mod protect;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::Path;
pub type Result<T> = std::result::Result<T, String>;
const LOCAL_SCHEMA_VERSION: i64 = 4;
const WORKSPACE_DATASETS: &[&str] = &[
    "overview",
    "orders",
    "menu",
    "customers",
    "reservations",
    "inventory",
    "accounting",
    "receivables",
    "cash_shifts",
    "cheques",
    "staff",
    "shifts",
    "payroll",
    "devices",
    "settings",
    "reports",
    "loyalty",
];
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn blob(v: &Value) -> Result<Vec<u8>> {
    protect::seal(&serde_json::to_vec(v).map_err(err)?)
}
fn value(v: Vec<u8>) -> Result<Value> {
    serde_json::from_slice(&protect::open(&v)?).map_err(err)
}
fn number(v: &Value, key: &str) -> Result<i64> {
    v[key]
        .as_i64()
        .ok_or_else(|| format!("عدد {key} نامعتبر است"))
}
fn clean(v: &str) -> String {
    v.replace(['|', '\r', '\n'], " ")
}
fn valid_manager_pin(pin: &str) -> bool {
    (8..=12).contains(&pin.len()) && pin.bytes().all(|byte| byte.is_ascii_digit())
}
fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        difference |= usize::from(
            left.get(index).copied().unwrap_or(0) ^ right.get(index).copied().unwrap_or(0),
        );
    }
    difference == 0
}

pub struct Store {
    conn: Connection,
}
pub struct Pending {
    pub id: String,
    pub revision: i64,
    pub payload: Value,
}
pub struct PrintJob {
    pub id: i64,
    pub code: String,
    pub content: String,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).map_err(err)?;
        conn.busy_timeout(std::time::Duration::from_secs(10))
            .map_err(err)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
        )
        .map_err(err)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(err)?;
        if version > LOCAL_SCHEMA_VERSION {
            return Err(format!("نسخهٔ پایگاه محلی ({version}) از این برنامه جدیدتر است؛ برای جلوگیری از آسیب به داده‌ها برنامه را به‌روزرسانی کنید"));
        }
        if version == 0 {
            conn.execute_batch("BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value BLOB NOT NULL);
            CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY, payload BLOB NOT NULL, revision INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, server_number INTEGER, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS print_jobs(id INTEGER PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), code TEXT NOT NULL, content BLOB NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '');
            PRAGMA user_version=1;
            COMMIT;").map_err(err)?;
        }
        if version < 2 {
            conn.execute_batch("BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS workspace_snapshots(
                business_id INTEGER NOT NULL,
                dataset TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK(revision >= 0),
                schema_version INTEGER NOT NULL CHECK(schema_version > 0),
                snapshot_id TEXT NOT NULL,
                issued_at TEXT NOT NULL,
                valid_until TEXT NOT NULL,
                payload BLOB NOT NULL,
                PRIMARY KEY(business_id,dataset)
            );
            CREATE TABLE IF NOT EXISTS workspace_commands(
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT NOT NULL UNIQUE,
                business_id INTEGER NOT NULL,
                module TEXT NOT NULL,
                action TEXT NOT NULL,
                base_dataset TEXT NOT NULL,
                base_snapshot_id TEXT NOT NULL,
                base_revision INTEGER NOT NULL CHECK(base_revision >= 0),
                payload BLOB NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','conflict','rejected','synced')),
                error TEXT NOT NULL DEFAULT '',
                attempts INTEGER NOT NULL DEFAULT 0,
                retry_at INTEGER NOT NULL DEFAULT 0,
                lease_until INTEGER NOT NULL DEFAULT 0,
                server_receipt TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS workspace_commands_pending ON workspace_commands(state,retry_at,lease_until,sequence);
            PRAGMA user_version=2;
            COMMIT;").map_err(err)?;
        }
        if version < 3 {
            conn.execute_batch("BEGIN IMMEDIATE;
            ALTER TABLE sales ADD COLUMN display_payload BLOB;
            PRAGMA user_version=3;
            COMMIT;").map_err(err)?;
        }
        if version < 4 {
            conn.execute_batch("BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS offline_order_history(
                business_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                order_number INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                payload BLOB NOT NULL,
                PRIMARY KEY(business_id,order_id)
            );
            CREATE INDEX IF NOT EXISTS offline_order_history_page_idx ON offline_order_history(business_id,created_at DESC,order_id DESC);
            PRAGMA user_version=4;
            COMMIT;").map_err(err)?;
        }
        Ok(Self { conn })
    }

    fn paired_business_id(&self) -> Result<i64> {
        self.get("pairing")?
            .and_then(|pair| pair["businessId"].as_i64())
            .filter(|id| *id > 0)
            .ok_or_else(|| "ابتدا دستگاه را به کسب‌وکار متصل کنید".to_string())
    }

    pub fn local_manager_pin_configured(&self) -> Result<bool> {
        Ok(self.get("workspace_manager_pin")?.is_some())
    }

    fn configure_local_manager_pin(&self, pin: &str) -> Result<()> {
        if !valid_manager_pin(pin) {
            return Err("PIN مدیریت باید ۸ تا ۱۲ رقم باشد".into());
        }
        self.set("workspace_manager_pin", &json!(pin))?;
        self.set("workspace_manager_pin_attempts", &json!(0))?;
        self.set("workspace_manager_pin_locked_until", &json!(0))
    }

    pub fn verify_local_manager_pin(&mut self, pin: &str) -> Result<()> {
        if !valid_manager_pin(pin) {
            return Err("PIN مدیریت باید ۸ تا ۱۲ رقم باشد".into());
        }
        let now = Utc::now().timestamp();
        let locked_until = self
            .get("workspace_manager_pin_locked_until")?
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        if locked_until > now {
            return Err("به‌دلیل چند تلاش ناموفق، ورود مدیر موقتاً قفل شده است".into());
        }
        let expected = self
            .get("workspace_manager_pin")?
            .and_then(|value| value.as_str().map(str::to_owned))
            .ok_or_else(|| "ابتدا مدیر باید با فایل اتصال معتبر، PIN محلی را تعریف کند".to_string())?;
        if constant_time_eq(expected.as_bytes(), pin.as_bytes()) {
            self.set("workspace_manager_pin_attempts", &json!(0))?;
            self.set("workspace_manager_pin_locked_until", &json!(0))?;
            return Ok(());
        }
        let attempts = self
            .get("workspace_manager_pin_attempts")?
            .and_then(|value| value.as_i64())
            .unwrap_or(0)
            + 1;
        if attempts >= 5 {
            self.set("workspace_manager_pin_attempts", &json!(0))?;
            self.set("workspace_manager_pin_locked_until", &json!(now + 600))?;
            return Err("PIN نادرست است؛ ورود مدیر برای ۱۰ دقیقه قفل شد".into());
        }
        self.set("workspace_manager_pin_attempts", &json!(attempts))?;
        Err("PIN مدیریت درست نیست".into())
    }

    pub fn pair_with_manager_pin(&mut self, config: &Value, pin: &str) -> Result<()> {
        if let Some(old) = self.get("pairing")? {
            if old["terminalId"] != config["terminalId"]
                || old["businessId"] != config["businessId"]
            {
                return Err("این پایگاه به صندوق یا کسب‌وکار دیگری متصل است؛ داده‌های محلی را حذف نکنید".into());
            }
        }
        if self.local_manager_pin_configured()? {
            self.verify_local_manager_pin(pin)?;
        } else {
            self.configure_local_manager_pin(pin)?;
        }
        self.pair(config)
    }

    pub fn save_workspace_snapshot(&mut self, snapshot: &Value) -> Result<()> {
        if snapshot["schemaVersion"].as_i64() != Some(1) {
            return Err("نسخهٔ دادهٔ محلی پشتیبانی نمی‌شود".into());
        }
        let business_id = number(snapshot, "businessId")?;
        if business_id != self.paired_business_id()? {
            return Err("این داده متعلق به کسب‌وکار متصل نیست".into());
        }
        let dataset = snapshot["dataset"]
            .as_str()
            .ok_or("نام مجموعهٔ داده لازم است")?;
        if !WORKSPACE_DATASETS.contains(&dataset) {
            return Err("این مجموعهٔ داده برای نگهداری محلی مجاز نیست".into());
        }
        let revision = number(snapshot, "revision")?;
        if revision < 0 {
            return Err("نسخهٔ داده نامعتبر است".into());
        }
        let snapshot_id = snapshot["snapshotId"]
            .as_str()
            .ok_or("شناسهٔ snapshot لازم است")?;
        uuid::Uuid::parse_str(snapshot_id).map_err(err)?;
        let issued = DateTime::parse_from_rfc3339(
            snapshot["issuedAt"]
                .as_str()
                .ok_or("زمان snapshot لازم است")?,
        )
        .map_err(err)?;
        let valid_until = DateTime::parse_from_rfc3339(
            snapshot["validUntil"]
                .as_str()
                .ok_or("مهلت snapshot لازم است")?,
        )
        .map_err(err)?;
        let now = Utc::now();
        if issued > now + chrono::Duration::minutes(5)
            || valid_until <= now
            || valid_until <= issued
            || valid_until > issued + chrono::Duration::days(90)
        {
            return Err("بازهٔ اعتبار snapshot معتبر نیست".into());
        }
        if !snapshot["payload"].is_object() && !snapshot["payload"].is_array() {
            return Err("محتوای snapshot معتبر نیست".into());
        }
        let payload = serde_json::to_vec(&snapshot["payload"]).map_err(err)?;
        if payload.len() > 10_000_000 {
            return Err("اندازهٔ مجموعهٔ داده از سقف ۱۰ مگابایت بیشتر است".into());
        }
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(err)?;
        let current: Option<(i64, String, Vec<u8>)> = tx.query_row(
            "SELECT revision,snapshot_id,payload FROM workspace_snapshots WHERE business_id=?1 AND dataset=?2",
            params![business_id,dataset], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)),
        ).optional().map_err(err)?;
        if let Some((current_revision, current_id, current_payload)) = current {
            if revision < current_revision {
                return Err("snapshot قدیمی‌تر از دادهٔ ذخیره‌شده است".into());
            }
            if revision == current_revision {
                if current_id == snapshot_id && value(current_payload)? == snapshot["payload"] {
                    tx.execute(
                        "UPDATE workspace_snapshots SET issued_at=?1,valid_until=?2 WHERE business_id=?3 AND dataset=?4",
                        params![issued.to_rfc3339(),valid_until.to_rfc3339(),business_id,dataset],
                    ).map_err(err)?;
                    return tx.commit().map_err(err);
                }
                return Err("دو snapshot متفاوت با نسخهٔ یکسان دریافت شد".into());
            }
        }
        tx.execute("INSERT INTO workspace_snapshots(business_id,dataset,revision,schema_version,snapshot_id,issued_at,valid_until,payload)
            VALUES(?1,?2,?3,1,?4,?5,?6,?7) ON CONFLICT(business_id,dataset) DO UPDATE SET revision=excluded.revision,schema_version=excluded.schema_version,snapshot_id=excluded.snapshot_id,issued_at=excluded.issued_at,valid_until=excluded.valid_until,payload=excluded.payload",
            params![business_id,dataset,revision,snapshot_id,issued.to_rfc3339(),valid_until.to_rfc3339(),blob(&snapshot["payload"])?]).map_err(err)?;
        if dataset == "orders" {
            let orders = snapshot["payload"]["orders"].as_array().ok_or("فهرست سفارش snapshot معتبر نیست")?;
            for order in orders {
                let order_id = number(order, "id")?;
                let order_number = number(order, "number")?;
                let created_at = order["createdAt"].as_str().filter(|value| DateTime::parse_from_rfc3339(value).is_ok()).ok_or("زمان سفارش snapshot معتبر نیست")?;
                tx.execute("INSERT INTO offline_order_history(business_id,order_id,order_number,created_at,payload) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(business_id,order_id) DO UPDATE SET order_number=excluded.order_number,created_at=excluded.created_at,payload=excluded.payload",
                    params![business_id,order_id,order_number,created_at,blob(order)?]).map_err(err)?;
            }
        }
        tx.commit().map_err(err)
    }

    pub fn save_order_history_page(&mut self, page: &Value, requested_cursor: Option<&str>) -> Result<()> {
        let business_id = number(page, "businessId")?;
        if business_id != self.paired_business_id()? || page["dataset"].as_str() != Some("orders-history") || page["schemaVersion"].as_i64() != Some(1) {
            return Err("صفحهٔ تاریخچه متعلق به صندوق یا نسخهٔ دیگری است".into());
        }
        let response_cursor = page["requestCursor"].as_str();
        if response_cursor != requested_cursor { return Err("نشانگر صفحهٔ پاسخ با درخواست هم‌خوان نیست".into()); }
        let sync = self.get("workspace_order_history_sync")?.unwrap_or(json!({"cursor":null,"complete":false}));
        if sync["complete"].as_bool() == Some(true) { return Err("آرشیو سفارش قبلاً کامل شده است".into()); }
        if sync["cursor"].as_str() != requested_cursor { return Err("وضعیت دریافت تاریخچه هم‌زمان تغییر کرده است".into()); }
        let has_more = page["hasMore"].as_bool().ok_or("وضعیت صفحهٔ سفارش معتبر نیست")?;
        let next_cursor = page["nextCursor"].as_str();
        if (has_more && (next_cursor.is_none() || next_cursor == requested_cursor)) || (!has_more && next_cursor.is_some()) {
            return Err("ادامهٔ صفحه‌بندی تاریخچه معتبر نیست".into());
        }
        let orders = page["orders"].as_array().ok_or("فهرست سفارش صفحه معتبر نیست")?;
        if orders.len() > 50 || (has_more && orders.is_empty()) { return Err("اندازه یا ترتیب صفحهٔ سفارش معتبر نیست".into()); }
        let issued_at = page["issuedAt"].as_str().filter(|value| DateTime::parse_from_rfc3339(value).is_ok()).ok_or("زمان صفحهٔ تاریخچه معتبر نیست")?;
        let tx = self.conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
        for order in orders {
            let order_id = number(order, "id")?;
            let order_number = number(order, "number")?;
            let created_at = order["createdAt"].as_str().filter(|value| DateTime::parse_from_rfc3339(value).is_ok()).ok_or("زمان سفارش صفحه معتبر نیست")?;
            tx.execute("INSERT INTO offline_order_history(business_id,order_id,order_number,created_at,payload) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(business_id,order_id) DO UPDATE SET order_number=excluded.order_number,created_at=excluded.created_at,payload=excluded.payload",
                params![business_id,order_id,order_number,created_at,blob(order)?]).map_err(err)?;
        }
        let cached_orders: i64 = tx.query_row("SELECT count(*) FROM offline_order_history WHERE business_id=?1", [business_id], |row| row.get(0)).map_err(err)?;
        let next_state = json!({"cursor":next_cursor,"complete":!has_more,"cachedOrders":cached_orders,"checkedAt":issued_at});
        tx.execute("INSERT INTO settings(key,value) VALUES('workspace_order_history_sync',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [blob(&next_state)?]).map_err(err)?;
        tx.commit().map_err(err)
    }

    pub fn workspace_order_history_page(&self, offset: i64, requested_limit: i64) -> Result<Value> {
        let business_id = self.paired_business_id()?;
        let limit = requested_limit.clamp(1, 500) as usize;
        let total: i64 = self.conn.query_row("SELECT count(*) FROM offline_order_history WHERE business_id=?1", [business_id], |row| row.get(0)).map_err(err)?;
        let mut query = self.conn.prepare("SELECT payload FROM offline_order_history WHERE business_id=?1 ORDER BY created_at DESC,order_id DESC LIMIT ?2 OFFSET ?3").map_err(err)?;
        let rows = query.query_map(params![business_id,(limit + 1) as i64,offset.max(0)], |row| row.get::<_, Vec<u8>>(0)).map_err(err)?;
        let mut orders = rows.map(|row| row.map_err(err).and_then(value)).collect::<Result<Vec<_>>>()?;
        let has_more = orders.len() > limit;
        if has_more { orders.truncate(limit); }
        let sync = self.get("workspace_order_history_sync")?.unwrap_or(json!({"cursor":null,"complete":false,"cachedOrders":total}));
        Ok(json!({"orders":orders,"totalOrders":total,"hasMore":has_more,"complete":sync["complete"].as_bool()==Some(true),"checkedAt":sync["checkedAt"]}))
    }

    pub fn delete_workspace_order_history(&mut self) -> Result<()> {
        let business_id = self.paired_business_id()?;
        let tx = self.conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
        tx.execute("DELETE FROM workspace_snapshots WHERE business_id=?1 AND dataset='orders'", [business_id]).map_err(err)?;
        tx.execute("DELETE FROM offline_order_history WHERE business_id=?1", [business_id]).map_err(err)?;
        tx.execute("DELETE FROM settings WHERE key IN ('workspace_order_history_sync','workspace_sync_orders','workspace_sync_orders_history')", []).map_err(err)?;
        tx.commit().map_err(err)
    }

    pub fn workspace_snapshot(&self, dataset: &str) -> Result<Option<Value>> {
        if !WORKSPACE_DATASETS.contains(&dataset) {
            return Err("این مجموعهٔ داده برای خواندن محلی مجاز نیست".into());
        }
        let business_id = self.paired_business_id()?;
        let row: Option<(i64,i64,String,String,String,Vec<u8>)> = self.conn.query_row(
            "SELECT revision,schema_version,snapshot_id,issued_at,valid_until,payload FROM workspace_snapshots WHERE business_id=?1 AND dataset=?2",
            params![business_id,dataset], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)),
        ).optional().map_err(err)?;
        row.map(|(revision,schema_version,snapshot_id,issued_at,valid_until,payload)| Ok(json!({
            "businessId":business_id,"dataset":dataset,"revision":revision,"schemaVersion":schema_version,
            "snapshotId":snapshot_id,"issuedAt":issued_at,"validUntil":valid_until,
            "expired":DateTime::parse_from_rfc3339(&valid_until).map_err(err)? < Utc::now(),"payload":value(payload)?
        }))).transpose()
    }

    pub fn delete_workspace_snapshot(&mut self, dataset: &str) -> Result<()> {
        if !WORKSPACE_DATASETS.contains(&dataset) {
            return Err("این مجموعهٔ داده برای حذف محلی مجاز نیست".into());
        }
        let business_id = self.paired_business_id()?;
        self.conn
            .execute(
                "DELETE FROM workspace_snapshots WHERE business_id=?1 AND dataset=?2",
                params![business_id, dataset],
            )
            .map_err(err)?;
        Ok(())
    }

    pub fn workspace_snapshot_index(&self) -> Result<Value> {
        let Some(business_id) = self
            .get("pairing")?
            .and_then(|pair| pair["businessId"].as_i64())
        else {
            return Ok(json!([]));
        };
        let mut q = self.conn.prepare("SELECT dataset,revision,schema_version,snapshot_id,issued_at,valid_until FROM workspace_snapshots WHERE business_id=?1 ORDER BY dataset").map_err(err)?;
        let rows = q.query_map([business_id], |r| Ok(json!({"dataset":r.get::<_,String>(0)?,"revision":r.get::<_,i64>(1)?,"schemaVersion":r.get::<_,i64>(2)?,"snapshotId":r.get::<_,String>(3)?,"issuedAt":r.get::<_,String>(4)?,"validUntil":r.get::<_,String>(5)?}))).map_err(err)?;
        Ok(json!(rows
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?))
    }

    pub fn enqueue_workspace_command(&mut self, command: &Value) -> Result<()> {
        if command["schemaVersion"].as_i64() != Some(1) {
            return Err("نسخهٔ فرمان محلی پشتیبانی نمی‌شود".into());
        }
        let business_id = number(command, "businessId")?;
        if business_id != self.paired_business_id()? {
            return Err("فرمان متعلق به کسب‌وکار متصل نیست".into());
        }
        let id = command["id"].as_str().ok_or("شناسهٔ فرمان لازم است")?;
        uuid::Uuid::parse_str(id).map_err(err)?;
        let module = command["module"].as_str().ok_or("نام ماژول لازم است")?;
        let action = command["action"].as_str().ok_or("نوع عملیات لازم است")?;
        let allowed = match module {
            "orders" => ["create", "change_status", "record_payment"].contains(&action),
            "menu" => [
                "create_product",
                "update_product",
                "archive_product",
                "update_category",
            ]
            .contains(&action),
            "customers" => ["create", "update"].contains(&action),
            "reservations" => ["create", "set_status"].contains(&action),
            "inventory" => ["receive", "movement", "waste", "transfer"].contains(&action),
            "accounting" => ["create_document", "reverse_document"].contains(&action),
            "receivables" => ["record_payment"].contains(&action),
            "staff" => ["attendance", "create_shift", "leave_request", "shift_change"].contains(&action),
            "payroll" => ["adjustment", "settlement"].contains(&action),
            "settings" => ["update"].contains(&action),
            "loyalty" => ["earn_points", "redeem_reward"].contains(&action),
            _ => false,
        };
        if !allowed {
            return Err("این فرمان آفلاین در فهرست مجاز نیست".into());
        }
        let base_dataset = match (module, action) {
            ("orders", "create") => "menu",
            ("orders", _) => "orders",
            ("menu", _) => "menu",
            ("customers", _) => "customers",
            ("reservations", _) => "reservations",
            ("inventory", _) => "inventory",
            ("accounting", _) => "accounting",
            ("receivables", _) => "receivables",
            ("staff", _) => "shifts",
            ("payroll", _) => "payroll",
            ("settings", _) => "settings",
            ("loyalty", _) => "loyalty",
            _ => return Err("برای این ماژول snapshot پایه تعریف نشده است".into()),
        };
        if command["baseDataset"].as_str() != Some(base_dataset) {
            return Err("مجموعهٔ دادهٔ پایهٔ فرمان با ماژول/عملیات هم‌خوان نیست".into());
        }
        let base_snapshot_id = command["baseSnapshotId"]
            .as_str()
            .ok_or("شناسهٔ snapshot پایه لازم است")?;
        let base_revision = number(command, "baseRevision")?;
        if base_revision < 0 {
            return Err("نسخهٔ پایهٔ فرمان معتبر نیست".into());
        }
        let snapshotless_reservation = module == "reservations" && action == "create";
        if snapshotless_reservation {
            if base_snapshot_id != "" || base_revision != 0 {
                return Err("رزرو آفلاین نباید snapshot منو را مبنا قرار دهد".into());
            }
        } else {
            uuid::Uuid::parse_str(base_snapshot_id).map_err(err)?;
        }
        if !command["payload"].is_object() {
            return Err("محتوای فرمان باید یک شیء JSON باشد".into());
        }
        let payload_json = serde_json::to_vec(command).map_err(err)?;
        if payload_json.len() > 1_000_000 {
            return Err("اندازهٔ فرمان از سقف یک مگابایت بیشتر است".into());
        }
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(err)?;
        let existing: Option<(String, String, Vec<u8>)> = tx
            .query_row(
                "SELECT module,action,payload FROM workspace_commands WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(err)?;
        if let Some((old_module, old_action, old_payload)) = existing {
            if old_module == module && old_action == action && value(old_payload)? == *command {
                return Ok(());
            }
            return Err("شناسهٔ فرمان قبلاً با محتوای دیگری ثبت شده است".into());
        }
        if !snapshotless_reservation {
            let base: Option<(i64, String, String)> = tx
                .query_row(
                    "SELECT revision,snapshot_id,valid_until FROM workspace_snapshots WHERE business_id=?1 AND dataset=?2",
                    params![business_id,base_dataset],
                    |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)),
                )
                .optional()
                .map_err(err)?;
            let Some((snapshot_revision, snapshot_id, valid_until)) = base else {
                return Err("snapshot پایهٔ این ماژول دریافت نشده است".into());
            };
            if snapshot_revision != base_revision || snapshot_id != base_snapshot_id {
                return Err("فرمان بر مبنای snapshot جاری ساخته نشده است".into());
            }
            if DateTime::parse_from_rfc3339(&valid_until).map_err(err)? <= Utc::now() {
                return Err("اعتبار snapshot پایان یافته؛ هنگام اتصال منو را به‌روز کنید".into());
            }
        }
        let count: i64 = tx
            .query_row(
                "SELECT count(*) FROM workspace_commands WHERE state!='synced'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if count >= 50_000 {
            return Err("صف تغییرات محلی پر شده؛ ابتدا همگام‌سازی را انجام دهید".into());
        }
        tx.execute("INSERT INTO workspace_commands(id,business_id,module,action,base_dataset,base_snapshot_id,base_revision,payload,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![id,business_id,module,action,base_dataset,base_snapshot_id,base_revision,blob(command)?,Utc::now().to_rfc3339()]).map_err(err)?;
        tx.commit().map_err(err)
    }

    pub fn enqueue_reservation_request(&mut self, payload: Value) -> Result<Value> {
        let Some(fields) = payload.as_object() else { return Err("اطلاعات رزرو معتبر نیست".into()) };
        let allowed = ["name", "phone", "guestCount", "startsAt", "note", "reservationType", "tableId"];
        if fields.keys().any(|key| !allowed.contains(&key.as_str())) {
            return Err("درخواست رزرو فیلد ناشناخته دارد".into());
        }
        let name = payload["name"].as_str().ok_or("نام مشتری لازم است")?.trim();
        if name.chars().count() < 2 || name.chars().count() > 80 { return Err("نام مشتری باید بین ۲ تا ۸۰ نویسه باشد".into()); }
        let phone = payload["phone"].as_str().ok_or("شمارهٔ موبایل لازم است")?;
        if !(10..=15).contains(&phone.len()) || !phone.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err("شمارهٔ موبایل را با رقم وارد کنید".into());
        }
        let guests = payload["guestCount"].as_i64().ok_or("تعداد مهمان معتبر نیست")?;
        if !(1..=30).contains(&guests) { return Err("تعداد مهمان باید بین ۱ تا ۳۰ نفر باشد".into()); }
        let starts_at = payload["startsAt"].as_str().ok_or("زمان رزرو لازم است")?;
        let starts_at = DateTime::parse_from_rfc3339(starts_at).map_err(err)?;
        if starts_at <= Utc::now() || starts_at > Utc::now() + chrono::Duration::days(90) {
            return Err("زمان رزرو باید تا ۹۰ روز آینده باشد".into());
        }
        let note = payload["note"].as_str().ok_or("توضیح رزرو معتبر نیست")?;
        if note.chars().count() > 300 { return Err("توضیح رزرو بیش از حد طولانی است".into()); }
        if !["normal", "occasion", "business"].contains(&payload["reservationType"].as_str().unwrap_or("")) {
            return Err("نوع رزرو معتبر نیست".into());
        }
        if !payload["tableId"].is_null() && (!payload["tableId"].is_i64() || payload["tableId"].as_i64().unwrap_or(0) < 1) {
            return Err("میز انتخاب‌شده معتبر نیست".into());
        }
        let business_id = self.paired_business_id()?;
        let id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":id,"businessId":business_id,"module":"reservations",
            "action":"create","baseDataset":"reservations","baseSnapshotId":"","baseRevision":0,
            "payload":payload
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":id,"state":"pending"}))
    }

    pub fn enqueue_reservation_status_with_pin(&mut self, pin: &str, reservation_id: i64, target_status: &str) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if reservation_id < 1 || !["confirmed", "cancelled", "completed", "no_show"].contains(&target_status) {
            return Err("شناسه یا وضعیت رزرو معتبر نیست".into());
        }
        let snapshot = self.workspace_snapshot("reservations")?.ok_or_else(|| "نسخهٔ رزروها دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) { return Err("نسخهٔ رزروها منقضی است؛ ابتدا آن را تازه کنید".into()); }
        let rows = snapshot["payload"]["reservations"].as_array().ok_or("فهرست رزروهای محلی معتبر نیست")?;
        let reservation = rows.iter().find(|row| row["id"].as_i64() == Some(reservation_id)).ok_or("رزرو در نسخهٔ محلی پیدا نشد؛ فهرست را تازه کنید")?;
        let current_status = reservation["status"].as_str().ok_or("وضعیت رزرو در نسخهٔ محلی معتبر نیست")?;
        let next_allowed = match current_status {
            "requested" => ["confirmed", "cancelled"].contains(&target_status),
            "confirmed" => ["cancelled", "completed", "no_show"].contains(&target_status),
            _ => false,
        };
        if !next_allowed { return Err("تغییر وضعیت رزرو با وضعیت فعلی مجاز نیست".into()); }
        if target_status == "confirmed" && reservation["depositStatus"].as_str() == Some("pending") {
            return Err("رزرو دارای پیش‌پرداخت معوق است؛ پرداخت را آفلاین تأیید نکنید".into());
        }
        let expected_updated_at = reservation["updatedAt"].as_str().ok_or("زمان تغییر رزرو در نسخهٔ محلی معتبر نیست")?;
        DateTime::parse_from_rfc3339(expected_updated_at).map_err(err)?;
        let snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ snapshot رزرو پیدا نشد")?;
        let issued_at = DateTime::parse_from_rfc3339(snapshot["issuedAt"].as_str().ok_or("زمان snapshot رزرو پیدا نشد")?).map_err(err)?;
        let business_id = number(&snapshot, "businessId")?;
        let mut query = self.conn.prepare("SELECT state,payload,created_at FROM workspace_commands WHERE business_id=?1 AND module='reservations' AND action='set_status' AND base_snapshot_id=?2 ORDER BY sequence").map_err(err)?;
        let commands = query.query_map(params![business_id,snapshot_id], |row| Ok((row.get::<_, String>(0)?,row.get::<_, Vec<u8>>(1)?,row.get::<_, String>(2)?))).map_err(err)?;
        for row in commands {
            let (state, payload, created_at) = row.map_err(err)?;
            let command = value(payload)?;
            if command["payload"]["reservationId"].as_i64() != Some(reservation_id) { continue; }
            if state == "pending" { return Err("برای این رزرو تغییر وضعیتی در صف همگام‌سازی است".into()); }
            if DateTime::parse_from_rfc3339(&created_at).map_err(err)? > issued_at {
                return Err("تغییر قبلی هنوز با snapshot تازه بازبینی نشده است؛ ابتدا رزروها را به‌روز کنید".into());
            }
        }
        drop(query);
        let command_id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":command_id,"businessId":business_id,"module":"reservations",
            "action":"set_status","baseDataset":"reservations","baseSnapshotId":snapshot_id,
            "baseRevision":snapshot["revision"],"payload":{
                "reservationId":reservation_id,"expectedStatus":current_status,
                "expectedUpdatedAt":expected_updated_at,"status":target_status
            }
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":command_id,"state":"pending","reservationId":reservation_id,"status":target_status}))
    }

    pub fn enqueue_menu_update_with_pin(
        &mut self,
        pin: &str,
        action: &str,
        target_id: i64,
        patch: Value,
    ) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if target_id < 1 || !["update_product", "update_category"].contains(&action) {
            return Err("نوع و شناسهٔ تغییر منو معتبر نیست".into());
        }
        let Some(fields) = patch.as_object() else {
            return Err("تغییرات منو معتبر نیست".into());
        };
        let allowed: &[&str] = if action == "update_product" {
            &["name", "description", "price", "isAvailable"]
        } else {
            &["name", "description", "isActive", "sortOrder"]
        };
        if fields.is_empty() || fields.keys().any(|key| !allowed.contains(&key.as_str())) {
            return Err("فقط فیلدهای مجاز محصول یا دسته قابل تغییر هستند".into());
        }
        let max_name = if action == "update_product" { 100 } else { 60 };
        if let Some(name) = patch.get("name") {
            let Some(name) = name.as_str() else { return Err("نام منو معتبر نیست".into()) };
            if name.trim().is_empty() || name.chars().count() > max_name {
                return Err("نام منو باید کوتاه‌تر و غیرخالی باشد".into());
            }
        }
        let max_description = if action == "update_product" { 400 } else { 500 };
        if let Some(description) = patch.get("description") {
            let Some(description) = description.as_str() else { return Err("توضیح منو معتبر نیست".into()) };
            if description.chars().count() > max_description {
                return Err("توضیح منو از حد مجاز طولانی‌تر است".into());
            }
        }
        if let Some(price) = patch.get("price") {
            let Some(price) = price.as_i64() else { return Err("قیمت محصول باید عدد صحیح باشد".into()) };
            if !(0..=100_000_000).contains(&price) {
                return Err("قیمت محصول خارج از بازهٔ مجاز است".into());
            }
        }
        if let Some(available) = patch.get("isAvailable") {
            if !available.is_boolean() { return Err("وضعیت موجودی معتبر نیست".into()); }
        }
        if let Some(active) = patch.get("isActive") {
            if !active.is_boolean() { return Err("وضعیت دسته‌بندی معتبر نیست".into()); }
        }
        if let Some(order) = patch.get("sortOrder") {
            let Some(order) = order.as_i64() else { return Err("ترتیب دسته‌بندی باید عدد صحیح باشد".into()) };
            if !(0..=10_000).contains(&order) { return Err("ترتیب دسته‌بندی خارج از بازهٔ مجاز است".into()); }
        }
        let snapshot = self
            .workspace_snapshot("menu")?
            .ok_or_else(|| "نسخهٔ محلی منو دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ منو منقضی است؛ برای ویرایش، ابتدا به اینترنت وصل و منو را تازه کنید".into());
        }
        let business_id = number(&snapshot, "businessId")?;
        let base_revision = number(&snapshot, "revision")?;
        let base_snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ snapshot منو پیدا نشد")?;
        let payload = if action == "update_product" {
            json!({"productId":target_id,"patch":patch})
        } else {
            json!({"categoryId":target_id,"patch":patch})
        };
        let id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":id,"businessId":business_id,"module":"menu",
            "action":action,"baseDataset":"menu","baseSnapshotId":base_snapshot_id,
            "baseRevision":base_revision,"payload":payload
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":id,"state":"pending","action":action,"targetId":target_id}))
    }

    pub fn enqueue_inventory_waste_with_pin(
        &mut self,
        pin: &str,
        item_id: i64,
        quantity: f64,
        waste_reason: &str,
        note: &str,
    ) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if item_id < 1 || !quantity.is_finite() || quantity <= 0.0 || quantity > 1_000_000_000.0 {
            return Err("کالا یا مقدار ضایعات معتبر نیست".into());
        }
        if !["spoilage", "expired", "prep_loss", "quality", "damaged", "other"].contains(&waste_reason) {
            return Err("دلیل ضایعات را انتخاب کنید".into());
        }
        if note.chars().count() > 300 {
            return Err("توضیح ضایعات بیش از حد طولانی است".into());
        }
        let snapshot = self.workspace_inventory_snapshot()?.ok_or_else(|| "نسخهٔ محلی انبار دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ موجودی منقضی است؛ برای ثبت ضایعات آن را به‌روز کنید".into());
        }
        let items = snapshot["payload"]["items"].as_array().ok_or("فهرست محلی انبار معتبر نیست")?;
        let item = items.iter().find(|row| row["id"].as_i64() == Some(item_id)).ok_or("کالا در نسخهٔ انبار این دستگاه پیدا نشد")?;
        if item["isActive"].as_bool() != Some(true) || item["trackStock"].as_bool() != Some(true) {
            return Err("ثبت ضایعات فقط برای کالای فعال و دارای ردیابی موجودی ممکن است".into());
        }
        let business_id = number(&snapshot, "businessId")?;
        let projection = &snapshot["localProjection"][item_id.to_string()];
        if projection["stale"].as_bool() == Some(true) { return Err("فرمان انبار قبلی با این نسخه سازگار نیست؛ ابتدا snapshot تازه بگیرید".into()); }
        let stock = projection["stock"].as_f64().ok_or("موجودی پیش‌بینی‌شدهٔ انبار معتبر نیست")?;
        let projected_cost = projection["costPerUnit"].as_i64().ok_or("بهای پیش‌بینی‌شدهٔ انبار معتبر نیست")?;
        let base_snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ snapshot انبار پیدا نشد")?;
        if stock < -1e-9 || quantity > stock + 1e-9 {
            return Err("مقدار ضایعات از موجودی قابل استفادهٔ این نسخه بیشتر است".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":id,"businessId":business_id,"module":"inventory",
            "action":"waste","baseDataset":"inventory","baseSnapshotId":base_snapshot_id,
            "baseRevision":snapshot["revision"],"payload":{
                "itemId":item_id,"quantity":quantity,"expectedStock":stock,"expectedCostPerUnit":projected_cost,"wasteReason":waste_reason,
                "note":note.trim(),"occurredAt":Utc::now().to_rfc3339()
            }
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":id,"state":"pending","itemId":item_id,"quantity":quantity}))
    }

    pub fn enqueue_inventory_movement_with_pin(
        &mut self,
        pin: &str,
        item_id: i64,
        movement_type: &str,
        quantity: f64,
        note: &str,
    ) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if item_id < 1 || !quantity.is_finite() || quantity < 0.0 || quantity > 1_000_000_000.0
            || (movement_type == "out" && quantity <= 0.0)
            || !["out", "adjust"].contains(&movement_type)
        {
            return Err("نوع گردش یا مقدار موجودی معتبر نیست".into());
        }
        if note.chars().count() > 300 {
            return Err("توضیح گردش بیش از حد طولانی است".into());
        }
        let snapshot = self.workspace_inventory_snapshot()?.ok_or_else(|| "نسخهٔ محلی انبار دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ موجودی منقضی است؛ برای ثبت گردش آن را به‌روز کنید".into());
        }
        let items = snapshot["payload"]["items"].as_array().ok_or("فهرست محلی انبار معتبر نیست")?;
        let item = items.iter().find(|row| row["id"].as_i64() == Some(item_id)).ok_or("کالا در نسخهٔ انبار این دستگاه پیدا نشد")?;
        if item["isActive"].as_bool() != Some(true) || item["trackStock"].as_bool() != Some(true) {
            return Err("گردش فقط برای کالای فعال و دارای ردیابی موجودی ممکن است".into());
        }
        let projection = &snapshot["localProjection"][item_id.to_string()];
        if projection["stale"].as_bool() == Some(true) {
            return Err("فرمان انبار قبلی با این نسخه سازگار نیست؛ ابتدا snapshot تازه بگیرید".into());
        }
        let stock = projection["stock"].as_f64().ok_or("موجودی پیش‌بینی‌شدهٔ انبار معتبر نیست")?;
        let cost = projection["costPerUnit"].as_i64().ok_or("بهای پیش‌بینی‌شدهٔ انبار معتبر نیست")?;
        if stock < -1e-9 || (movement_type == "out" && quantity > stock + 1e-9) {
            return Err("موجودی قابل استفاده برای این خروج کافی نیست".into());
        }
        let delta = if movement_type == "out" { quantity } else { (quantity - stock).abs() };
        if !delta.is_finite() || delta * cost.max(0) as f64 > 1_000_000_000_000.0 {
            return Err("ارزش این گردش از سقف مجاز بیشتر است".into());
        }
        if movement_type == "adjust" && (quantity - stock).abs() <= 1e-9 {
            return Err("موجودی شمارش‌شده با موجودی پیش‌بینی‌شده تفاوتی ندارد".into());
        }
        let business_id = number(&snapshot, "businessId")?;
        let base_snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ snapshot انبار پیدا نشد")?;
        let id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":id,"businessId":business_id,"module":"inventory",
            "action":"movement","baseDataset":"inventory","baseSnapshotId":base_snapshot_id,
            "baseRevision":snapshot["revision"],"payload":{
                "type":movement_type,"itemId":item_id,"quantity":quantity,
                "expectedStock":stock,"expectedCostPerUnit":cost,"note":note.trim(),
                "occurredAt":Utc::now().to_rfc3339()
            }
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":id,"state":"pending","itemId":item_id,"type":movement_type,"quantity":quantity}))
    }

    pub fn enqueue_inventory_receive_with_pin(
        &mut self, pin: &str, occurred_at: &str, invoice_no: &str, supplier_id: Option<i64>,
        discount: i64, extra_cost: i64, shipping_cost: i64, tax_amount: i64, paid_amount: i64,
        pay_from: &str, note: &str, raw_lines: &Value,
    ) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if invoice_no.chars().count() > 40 || note.chars().count() > 300 || !["cash", "bank", "payable"].contains(&pay_from) {
            return Err("شماره فاکتور، توضیح یا روش پرداخت معتبر نیست".into());
        }
        let occurred = DateTime::parse_from_rfc3339(occurred_at).map_err(err)?;
        let snapshot = self.workspace_inventory_snapshot()?.ok_or_else(|| "نسخهٔ محلی انبار دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) { return Err("نسخهٔ انبار منقضی است؛ ابتدا موجودی را تازه کنید".into()); }
        let issued_at = DateTime::parse_from_rfc3339(snapshot["issuedAt"].as_str().ok_or("زمان snapshot انبار پیدا نشد")?).map_err(err)?;
        if occurred > Utc::now() + chrono::Duration::days(1) || occurred < issued_at - chrono::Duration::days(7) {
            return Err("تاریخ فاکتور بیرون از بازهٔ مجاز نسخهٔ محلی است".into());
        }
        let suppliers = snapshot["payload"]["suppliers"].as_array().ok_or("فهرست فروشندگان در snapshot انبار موجود نیست")?;
        let supplier = if let Some(id) = supplier_id {
            Some(suppliers.iter().find(|row| row["id"].as_i64() == Some(id) && row["isActive"].as_bool() == Some(true)).ok_or("فروشنده در نسخهٔ محلی فعال نیست")?)
        } else { None };
        if pay_from == "payable" && (supplier.is_none() || supplier.map_or(true, |row| row["hasPayableAccount"].as_bool() != Some(true))) {
            return Err("برای ثبت فاکتور نسیه، فروشندهٔ دارای حساب تفصیلی لازم است".into());
        }
        let lines = raw_lines.as_array().ok_or("اقلام فاکتور باید به شکل فهرست ارسال شوند")?;
        if lines.is_empty() || lines.len() > 100 { return Err("فاکتور باید بین ۱ تا ۱۰۰ قلم داشته باشد".into()); }
        let items = snapshot["payload"]["items"].as_array().ok_or("فهرست کالاهای snapshot انبار معتبر نیست")?;
        let business_id = number(&snapshot, "businessId")?;
        let snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ snapshot انبار پیدا نشد")?;
        let mut parsed = Vec::with_capacity(lines.len());
        let mut seen = std::collections::HashSet::new();
        let mut subtotal = 0_i64;
        for raw in lines {
            let item_id = raw["itemId"].as_i64().ok_or("کالای فاکتور معتبر نیست")?;
            let quantity = raw["quantity"].as_f64().ok_or("مقدار فاکتور معتبر نیست")?;
            let unit_cost = raw["unitCost"].as_i64().ok_or("بهای خرید باید عدد صحیح تومان باشد")?;
            if item_id < 1 || !seen.insert(item_id) || !quantity.is_finite() || quantity <= 0.0 || quantity > 1_000_000_000.0 || unit_cost <= 0 || unit_cost > 1_000_000_000 {
                return Err("کالا، مقدار یا بهای خرید ردیف فاکتور نامعتبر است".into());
            }
            let gross = quantity * unit_cost as f64;
            if !gross.is_finite() || gross <= 0.0 || gross > 1_000_000_000_000.0 { return Err("مبلغ ردیف فاکتور بیش از حد مجاز است".into()); }
            let gross = gross.round() as i64;
            if gross <= 0 { return Err("مبلغ هر قلم پس از گردکردن باید بیشتر از صفر باشد".into()); }
            subtotal = subtotal.checked_add(gross).ok_or("جمع اقلام از سقف مجاز بیشتر است")?;
            parsed.push((item_id, quantity, unit_cost, gross));
        }
        if discount < 0 || extra_cost < 0 || shipping_cost < 0 || tax_amount < 0 || paid_amount < 0 || [discount, extra_cost, shipping_cost, tax_amount].iter().any(|value| *value > 1_000_000_000_000) || discount > subtotal {
            return Err("تخفیف، هزینه یا مبلغ پرداختی نامعتبر است".into());
        }
        let total = subtotal.checked_sub(discount).and_then(|value| value.checked_add(extra_cost)).and_then(|value| value.checked_add(shipping_cost)).and_then(|value| value.checked_add(tax_amount)).ok_or("جمع فاکتور از سقف مجاز بیشتر است")?;
        if total <= 0 || total > 1_000_000_000_000 || paid_amount > total || (pay_from == "payable" && paid_amount != 0) || (total > paid_amount && supplier.map_or(true, |row| row["hasPayableAccount"].as_bool() != Some(true))) {
            return Err("جمع فاکتور یا مبلغ پرداختی با فروشنده و روش پرداخت سازگار نیست".into());
        }
        parsed.sort_by_key(|line| line.0);
        let mut cumulative = 0_i64;
        let mut allocated_before = 0_i64;
        let mut command_lines = Vec::with_capacity(parsed.len());
        for (item_id, quantity, unit_cost, gross) in parsed {
            cumulative += gross;
            let allocated_next = (total as f64 * (cumulative as f64 / subtotal as f64)).round() as i64;
            let allocated_amount = allocated_next - allocated_before;
            allocated_before = allocated_next;
            let item = items.iter().find(|row| row["id"].as_i64() == Some(item_id)).ok_or("کالا در نسخهٔ محلی انبار پیدا نشد")?;
            if item["isActive"].as_bool() != Some(true) || item["trackStock"].as_bool() != Some(true) { return Err("ورود فقط برای کالای فعال و دارای ردیابی موجودی ممکن است".into()); }
            let projection = &snapshot["localProjection"][item_id.to_string()];
            if projection["stale"].as_bool() == Some(true) { return Err("فرمان انبار قبلی با این نسخه سازگار نیست؛ ابتدا snapshot تازه بگیرید".into()); }
            let expected_stock = projection["stock"].as_f64().ok_or("موجودی پیش‌بینی‌شدهٔ کالا معتبر نیست")?;
            let expected_cost = projection["costPerUnit"].as_i64().ok_or("بهای پیش‌بینی‌شدهٔ کالا معتبر نیست")?;
            if expected_stock < 0.0 { return Err("موجودی منفی است؛ پیش از ثبت فاکتور snapshot و گردش انبار را بررسی کنید".into()); }
            let cost_float = (expected_stock * expected_cost as f64 + allocated_amount as f64) / (expected_stock + quantity);
            if !cost_float.is_finite() || cost_float > 2_147_483_647.0 { return Err("بهای میانگین کالا از سقف مجاز بیشتر است".into()); }
            command_lines.push(json!({"itemId":item_id,"quantity":quantity,"unitCost":unit_cost,"expectedStock":expected_stock,"expectedCostPerUnit":expected_cost,"allocatedAmount":allocated_amount,"resultCostPerUnit":cost_float.round() as i64}));
        }
        let command_id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":command_id,"businessId":business_id,"module":"inventory","action":"receive",
            "baseDataset":"inventory","baseSnapshotId":snapshot_id,"baseRevision":snapshot["revision"],
            "payload":{"occurredAt":occurred.to_rfc3339(),"invoiceNo":invoice_no.trim(),"supplierId":supplier_id,"note":note.trim(),
                "discount":discount,"extraCost":extra_cost,"shippingCost":shipping_cost,"taxAmount":tax_amount,"total":total,
                "paidAmount":paid_amount,"payFrom":pay_from,"lines":command_lines}
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":command_id,"state":"pending","action":"receive","total":total,"lineCount":lines.len()}))
    }

    pub fn enqueue_accounting_document_with_pin(
        &mut self,
        pin: &str,
        date: &str,
        description: &str,
        raw_lines: &Value,
    ) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if description.trim().chars().count() < 2 || description.chars().count() > 300 {
            return Err("شرح سند باید بین ۲ تا ۳۰۰ نویسه باشد".into());
        }
        let date = DateTime::parse_from_rfc3339(date).map_err(|_| "تاریخ سند معتبر نیست")?;
        let snapshot = self.workspace_snapshot("accounting")?.ok_or_else(|| "نسخهٔ حسابداری محلی دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ حسابداری منقضی است؛ برای ثبت سند، ابتدا اتصال و حساب‌ها را تازه کنید".into());
        }
        let years = snapshot["payload"]["years"].as_array().ok_or("فهرست سال مالی محلی معتبر نیست")?;
        let year_is_open = years.iter().any(|year| {
            let start = year["startDate"].as_str().and_then(|value| DateTime::parse_from_rfc3339(value).ok());
            let end = year["endDate"].as_str().and_then(|value| DateTime::parse_from_rfc3339(value).ok());
            year["isClosed"].as_bool() == Some(false) && start.is_some_and(|value| date >= value) && end.is_some_and(|value| date <= value)
        });
        if !year_is_open {
            return Err("تاریخ باید در یکی از سال‌های مالی بازِ نسخهٔ محلی باشد".into());
        }
        let accounts = snapshot["payload"]["accounts"].as_array().ok_or("فهرست حساب‌های محلی معتبر نیست")?;
        let rows = raw_lines.as_array().ok_or("ردیف‌های سند باید یک فهرست باشند")?;
        if rows.len() < 2 || rows.len() > 200 {
            return Err("سند باید دست‌کم دو ردیف و حداکثر ۲۰۰ ردیف داشته باشد".into());
        }
        let mut lines = Vec::with_capacity(rows.len());
        let mut debit_total = 0_i64;
        let mut credit_total = 0_i64;
        for row in rows {
            let account_id = row["accountId"].as_i64().filter(|value| *value > 0).ok_or("حساب یک ردیف معتبر نیست")?;
            if !accounts.iter().any(|account| account["id"].as_i64() == Some(account_id) && account["isActive"].as_bool() == Some(true) && account["level"].as_str() != Some("kol")) {
                return Err("حساب ردیف در نسخهٔ محلی فعال نیست یا امکان ثبت سند روی آن وجود ندارد".into());
            }
            let debit = row["debit"].as_i64().filter(|value| *value >= 0).ok_or("مبلغ بدهکار باید عدد صحیح نامنفی باشد")?;
            let credit = row["credit"].as_i64().filter(|value| *value >= 0).ok_or("مبلغ بستانکار باید عدد صحیح نامنفی باشد")?;
            if debit > 0 && credit > 0 { return Err("هر ردیف فقط می‌تواند بدهکار یا بستانکار باشد".into()); }
            let line_description = row["description"].as_str().ok_or("شرح ردیف معتبر نیست")?;
            if line_description.chars().count() > 200 { return Err("شرح ردیف بیش از حد طولانی است".into()); }
            debit_total = debit_total.checked_add(debit).ok_or("جمع بدهکار از محدوده مجاز خارج شد")?;
            credit_total = credit_total.checked_add(credit).ok_or("جمع بستانکار از محدوده مجاز خارج شد")?;
            lines.push(json!({"accountId":account_id,"debit":debit,"credit":credit,"description":line_description.trim()}));
        }
        if debit_total <= 0 || debit_total != credit_total {
            return Err("سند تراز نیست؛ جمع بدهکار و بستانکار باید برابر و غیرصفر باشد".into());
        }
        let business_id = number(&snapshot, "businessId")?;
        let base_snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ نسخهٔ حسابداری پیدا نشد")?;
        let command_id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":command_id,"businessId":business_id,"module":"accounting",
            "action":"create_document","baseDataset":"accounting","baseSnapshotId":base_snapshot_id,
            "baseRevision":snapshot["revision"],"payload":{
                "date":date.with_timezone(&Utc).to_rfc3339(),"kind":"general","description":description.trim(),"lines":lines
            }
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":command_id,"state":"pending","action":"create_document","totalAmount":debit_total}))
    }

    pub fn enqueue_receivable_cash_payment_with_pin(&mut self, pin: &str, receivable_id: i64, amount: i64, note: &str) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if receivable_id < 1 || amount < 1 || amount > 2_000_000_000 || note.chars().count() > 300 {
            return Err("شناسه، مبلغ یا توضیح دریافت معتبر نیست".into());
        }
        let snapshot = self.workspace_snapshot("receivables")?.ok_or_else(|| "نسخهٔ مطالبات دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) { return Err("نسخهٔ مطالبات منقضی است؛ برای ثبت دریافت، ابتدا اتصال را تازه کنید".into()); }
        let rows = snapshot["payload"]["receivables"].as_array().ok_or("فهرست مطالبات محلی معتبر نیست")?;
        let receivable = rows.iter().find(|row| row["id"].as_i64() == Some(receivable_id)).ok_or("طلب در نسخهٔ محلی پیدا نشد؛ فهرست را تازه کنید")?;
        let expected_balance = receivable["balance"].as_i64().filter(|value| *value > 0).ok_or("ماندهٔ طلب صفر یا نامعتبر است")?;
        if amount > expected_balance { return Err("مبلغ دریافت از ماندهٔ طلب بیشتر است".into()); }
        let snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ نسخهٔ مطالبات پیدا نشد")?;
        let issued_at = DateTime::parse_from_rfc3339(snapshot["issuedAt"].as_str().ok_or("زمان نسخهٔ مطالبات پیدا نشد")?).map_err(err)?;
        let business_id = number(&snapshot, "businessId")?;
        let mut query = self.conn.prepare("SELECT state,created_at,payload FROM workspace_commands WHERE business_id=?1 AND module='receivables' AND action='record_payment' AND base_snapshot_id=?2 ORDER BY sequence").map_err(err)?;
        let commands = query.query_map(params![business_id,snapshot_id], |row| Ok((row.get::<_, String>(0)?,row.get::<_, String>(1)?,row.get::<_, Vec<u8>>(2)?))).map_err(err)?;
        for row in commands {
            let (state, created_at, payload) = row.map_err(err)?;
            let command = value(payload)?;
            if command["payload"]["receivableId"].as_i64() != Some(receivable_id) { continue; }
            if state == "pending" || DateTime::parse_from_rfc3339(&created_at).map_err(err)? > issued_at {
                return Err("برای این طلب دریافت محلی ثبت شده است؛ تا دریافت نسخهٔ تازه، دریافت دیگری ثبت نکنید".into());
            }
        }
        drop(query);
        let command_id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":command_id,"businessId":business_id,"module":"receivables",
            "action":"record_payment","baseDataset":"receivables","baseSnapshotId":snapshot_id,
            "baseRevision":snapshot["revision"],"payload":{
                "receivableId":receivable_id,"amount":amount,"method":"cash","note":note.trim(),"expectedBalance":expected_balance
            }
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":command_id,"state":"pending","receivableId":receivable_id,"amount":amount}))
    }

    pub fn workspace_inventory_snapshot(&self) -> Result<Option<Value>> {
        let Some(mut snapshot) = self.workspace_snapshot("inventory")? else { return Ok(None); };
        let business_id = number(&snapshot, "businessId")?;
        let snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ snapshot انبار پیدا نشد")?.to_string();
        let snapshot_issued_at = DateTime::parse_from_rfc3339(snapshot["issuedAt"].as_str().ok_or("زمان snapshot انبار پیدا نشد")?).map_err(err)?;
        let rows = snapshot["payload"]["items"].as_array().cloned().unwrap_or_default();
        let mut states = std::collections::HashMap::<i64, (f64, i64, bool)>::new();
        for item in &rows {
            if let Some(item_id) = item["id"].as_i64() {
                states.insert(item_id, (item["stock"].as_f64().unwrap_or(0.0), item["costPerUnit"].as_i64().unwrap_or(0), false));
            }
        }
        let mut query = self.conn.prepare("SELECT state,payload,created_at FROM workspace_commands WHERE business_id=?1 AND module='inventory' AND action IN ('receive','waste','movement') AND base_snapshot_id=?2 ORDER BY sequence ASC").map_err(err)?;
        let commands = query.query_map(params![business_id,snapshot_id], |row| Ok((row.get::<_, String>(0)?,row.get::<_, Vec<u8>>(1)?,row.get::<_, String>(2)?))).map_err(err)?;
        for row in commands {
            let (state, payload, created_at) = row.map_err(err)?;
            let command = value(payload)?;
            let payload = &command["payload"];
            if state == "conflict" || state == "rejected" {
                let command_created_at = DateTime::parse_from_rfc3339(&created_at).map_err(err)?;
                if command_created_at <= snapshot_issued_at { continue; }
                match command["action"].as_str() {
                    Some("waste") => if let Some(item_id) = payload["itemId"].as_i64() {
                        if let Some((_, _, stale)) = states.get_mut(&item_id) { *stale = true; }
                    },
                    Some("movement") => if let Some(item_id) = payload["itemId"].as_i64() {
                        if let Some((_, _, stale)) = states.get_mut(&item_id) { *stale = true; }
                    },
                    Some("receive") => if let Some(lines) = payload["lines"].as_array() {
                        for line in lines {
                            if let Some(item_id) = line["itemId"].as_i64() {
                                if let Some((_, _, stale)) = states.get_mut(&item_id) { *stale = true; }
                            }
                        }
                    },
                    _ => {}
                }
                continue;
            }
            if state != "pending" && state != "synced" { continue; }
            match command["action"].as_str() {
                Some("waste") => if let Some(item_id) = payload["itemId"].as_i64() {
                    if let Some((stock, _, stale)) = states.get_mut(&item_id) {
                        let expected = payload["expectedStock"].as_f64().unwrap_or(f64::NAN);
                        if *stale || !expected.is_finite() || (expected - *stock).abs() > 1e-9 { *stale = true; }
                        else { *stock = (*stock - payload["quantity"].as_f64().unwrap_or(0.0)).max(0.0); }
                    }
                },
                Some("movement") => if let Some(item_id) = payload["itemId"].as_i64() {
                    if let Some((stock, cost, stale)) = states.get_mut(&item_id) {
                        let expected_stock = payload["expectedStock"].as_f64().unwrap_or(f64::NAN);
                        let expected_cost = payload["expectedCostPerUnit"].as_i64().unwrap_or(-1);
                        let quantity = payload["quantity"].as_f64().unwrap_or(f64::NAN);
                        if *stale || !expected_stock.is_finite() || !quantity.is_finite()
                            || (expected_stock - *stock).abs() > 1e-9 || expected_cost != *cost
                        {
                            *stale = true;
                        } else if payload["type"].as_str() == Some("out") {
                            if quantity <= 0.0 || quantity > *stock + 1e-9 { *stale = true; }
                            else { *stock = (*stock - quantity).max(0.0); }
                        } else if payload["type"].as_str() == Some("adjust") && quantity >= 0.0 {
                            *stock = quantity;
                        } else {
                            *stale = true;
                        }
                    }
                },
                Some("receive") => if let Some(lines) = payload["lines"].as_array() {
                    for line in lines {
                        let Some(item_id) = line["itemId"].as_i64() else { continue; };
                        if let Some((stock, cost, stale)) = states.get_mut(&item_id) {
                            let expected_stock = line["expectedStock"].as_f64().unwrap_or(f64::NAN);
                            let expected_cost = line["expectedCostPerUnit"].as_i64().unwrap_or(-1);
                            if *stale || !expected_stock.is_finite() || (expected_stock - *stock).abs() > 1e-9 || expected_cost != *cost { *stale = true; }
                            else {
                                *stock += line["quantity"].as_f64().unwrap_or(0.0);
                                *cost = line["resultCostPerUnit"].as_i64().unwrap_or(*cost);
                            }
                        }
                    }
                },
                _ => {}
            }
        }
        let mut projection = serde_json::Map::new();
        for (item_id, (stock, cost, stale)) in states {
            projection.insert(item_id.to_string(), json!({"stock":stock,"costPerUnit":cost,"stale":stale}));
        }
        snapshot["localProjection"] = Value::Object(projection);
        Ok(Some(snapshot))
    }

    pub fn workspace_inventory_commands(&self) -> Result<Value> {
        let Some(business_id) = self.get("pairing")?.and_then(|pair| pair["businessId"].as_i64()) else {
            return Ok(json!([]));
        };
        let mut query = self.conn.prepare("SELECT id,state,error,payload,created_at,sequence,base_snapshot_id FROM workspace_commands WHERE business_id=?1 AND module='inventory' AND action IN ('receive','waste','movement') ORDER BY sequence DESC LIMIT 50").map_err(err)?;
        let rows = query.query_map([business_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Vec<u8>>(3)?, row.get::<_, String>(4)?, row.get::<_, i64>(5)?, row.get::<_, Option<String>>(6)?))).map_err(err)?;
        rows.map(|row| {
            let (id,state,error,payload,created_at,sequence,base_snapshot_id) = row.map_err(err)?;
            let command = value(payload)?;
            Ok(json!({
                "id":id,"state":state,"error":error,"createdAt":created_at,
                "sequence":sequence,"baseSnapshotId":base_snapshot_id,"action":command["action"],"payload":command["payload"]
            }))
        }).collect::<Result<Vec<_>>>().map(|items| json!(items))
    }

    pub fn enqueue_staff_attendance_with_pin(
        &mut self,
        pin: &str,
        schedule_id: i64,
        action: &str,
        occurred_at: &str,
    ) -> Result<Value> {
        self.verify_local_manager_pin(pin)?;
        if schedule_id < 1 || !["check_in", "check_out"].contains(&action) {
            return Err("شیفت یا نوع ثبت حضور معتبر نیست".into());
        }
        let occurred = DateTime::parse_from_rfc3339(occurred_at).map_err(err)?;
        let snapshot = self.workspace_snapshot("shifts")?.ok_or_else(|| "نسخهٔ محلی برنامهٔ شیفت دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ برنامهٔ شیفت منقضی است؛ برای ثبت حضور ابتدا آن را تازه کنید".into());
        }
        let schedules = snapshot["payload"]["schedules"].as_array().ok_or("فهرست شیفت‌های محلی معتبر نیست")?;
        let shift = schedules.iter().find(|row| row["id"].as_i64() == Some(schedule_id)).ok_or("شیفت در نسخهٔ محلی پیدا نشد")?;
        if shift["status"].as_str() != Some("scheduled") {
            return Err("ثبت حضور فقط برای شیفت برنامه‌ریزی‌شده ممکن است".into());
        }
        let staff_id = number(shift, "staffId")?;
        let starts = DateTime::parse_from_rfc3339(shift["startsAt"].as_str().ok_or("زمان شروع شیفت پیدا نشد")?).map_err(err)?;
        let ends = DateTime::parse_from_rfc3339(shift["endsAt"].as_str().ok_or("زمان پایان شیفت پیدا نشد")?).map_err(err)?;
        let attendance = &shift["attendance"];
        let mut previous_request_id: Option<String> = None;
        let check_in = if attendance.is_object() && !attendance["checkInAt"].is_null() {
            Some(DateTime::parse_from_rfc3339(attendance["checkInAt"].as_str().ok_or("زمان ورود ذخیره‌شده معتبر نیست")?).map_err(err)?)
        } else {
            None
        };
        let check_out = attendance.is_object() && !attendance["checkOutAt"].is_null();
        let local_events = self.workspace_staff_attendance_events()?;
        let events = local_events.as_array().ok_or("فهرست درخواست‌های حضور محلی معتبر نیست")?;
        let active_check_in = events.iter().find(|row| {
            row["payload"]["scheduleId"].as_i64() == Some(schedule_id)
                && row["payload"]["action"].as_str() == Some("check_in")
                && (row["state"].as_str() == Some("pending") || (row["state"].as_str() == Some("synced") && !["approved", "rejected", "conflict"].contains(&row["reviewStatus"].as_str().unwrap_or(""))))
        });
        let active_check_out = events.iter().any(|row| {
            row["payload"]["scheduleId"].as_i64() == Some(schedule_id)
                && row["payload"]["action"].as_str() == Some("check_out")
                && (row["state"].as_str() == Some("pending") || (row["state"].as_str() == Some("synced") && !["approved", "rejected", "conflict"].contains(&row["reviewStatus"].as_str().unwrap_or(""))))
        });
        let expected_check_in = if action == "check_in" {
            if check_in.is_some() || check_out || active_check_in.is_some() {
                return Err("برای این شیفت ورود قبلاً ثبت یا درخواست شده است".into());
            }
            let earliest = starts - chrono::Duration::hours(2);
            let latest = ends + chrono::Duration::hours(2);
            if occurred < earliest || occurred > latest {
                return Err("ثبت ورود فقط از دو ساعت پیش از شروع تا دو ساعت پس از پایان شیفت ممکن است".into());
            }
            None
        } else {
            if check_out || active_check_out {
                return Err("برای این شیفت خروج قبلاً ثبت یا درخواست شده است".into());
            }
            let known = if let Some(value) = check_in {
                Some(value)
            } else if let Some(pending) = active_check_in {
                previous_request_id = pending["commandId"].as_str().map(str::to_owned);
                Some(DateTime::parse_from_rfc3339(pending["payload"]["occurredAt"].as_str().ok_or("زمان ورود آفلاین معتبر نیست")?).map_err(err)?)
            } else {
                None
            }.ok_or("ابتدا ورود این شیفت را ثبت کنید")?;
            if occurred < known || occurred < starts || occurred > ends + chrono::Duration::hours(12) {
                return Err("زمان خروج باید پس از ورود و حداکثر تا ۱۲ ساعت پس از پایان شیفت باشد".into());
            }
            Some(known)
        };
        let _ = expected_check_in;
        let business_id = number(&snapshot, "businessId")?;
        let base_revision = number(&snapshot, "revision")?;
        let base_snapshot_id = snapshot["snapshotId"].as_str().ok_or("شناسهٔ نسخهٔ شیفت پیدا نشد")?;
        let id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":id,"businessId":business_id,"module":"staff","action":"attendance",
            "baseDataset":"shifts","baseSnapshotId":base_snapshot_id,"baseRevision":base_revision,
            "payload":{"scheduleId":schedule_id,"staffId":staff_id,"action":action,"occurredAt":occurred.to_rfc3339(),"previousRequestId":previous_request_id}
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":id,"state":"pending","action":action,"scheduleId":schedule_id}))
    }

    pub fn enqueue_staff_shift_create_with_pin(
        &mut self,
        manager_pin: &str,
        staff_id: i64,
        starts_at: &str,
        ends_at: &str,
        location: &str,
    ) -> Result<Value> {
        self.verify_local_manager_pin(manager_pin)?;
        if staff_id < 1 || location.chars().count() > 100 {
            return Err("اطلاعات شیفت معتبر نیست".into());
        }
        let starts = DateTime::parse_from_rfc3339(starts_at).map_err(err)?;
        let ends = DateTime::parse_from_rfc3339(ends_at).map_err(err)?;
        if ends <= starts || ends - starts > chrono::Duration::hours(24) {
            return Err("مدت شیفت باید بیشتر از صفر و حداکثر ۲۴ ساعت باشد".into());
        }
        let snapshot = self.workspace_snapshot("shifts")?.ok_or_else(|| "نسخهٔ محلی کارکنان دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ برنامهٔ کارکنان منقضی است؛ ابتدا آن را تازه کنید".into());
        }
        let roster = snapshot["payload"]["staff"].as_array().ok_or("فهرست کارکنان محلی معتبر نیست")?;
        if !roster.iter().any(|row| row["id"].as_i64() == Some(staff_id)) {
            return Err("کارمند فعال در نسخهٔ محلی پیدا نشد".into());
        }
        let from = DateTime::parse_from_rfc3339(snapshot["payload"]["range"]["from"].as_str().ok_or("ابتدای بازهٔ کارکنان پیدا نشد")?).map_err(err)?;
        let to = DateTime::parse_from_rfc3339(snapshot["payload"]["range"]["to"].as_str().ok_or("انتهای بازهٔ کارکنان پیدا نشد")?).map_err(err)?;
        if starts < from || ends > to {
            return Err("زمان شیفت باید داخل بازهٔ snapshot برنامهٔ کارکنان باشد".into());
        }
        let schedules = snapshot["payload"]["schedules"].as_array().ok_or("فهرست شیفت‌های محلی معتبر نیست")?;
        if schedules.iter().any(|row| {
            if row["staffId"].as_i64() != Some(staff_id) || row["status"].as_str() != Some("scheduled") { return false; }
            let existing_start = row["startsAt"].as_str().and_then(|value| DateTime::parse_from_rfc3339(value).ok());
            let existing_end = row["endsAt"].as_str().and_then(|value| DateTime::parse_from_rfc3339(value).ok());
            existing_start.is_some_and(|value| value < ends) && existing_end.is_some_and(|value| value > starts)
        }) {
            return Err("کارمند در snapshot این بازه شیفت دیگری دارد".into());
        }
        let leaves = snapshot["payload"]["leaveRequests"].as_array().ok_or("فهرست مرخصی‌های محلی معتبر نیست")?;
        if leaves.iter().any(|row| {
            if row["staffId"].as_i64() != Some(staff_id) || row["status"].as_str() != Some("approved") { return false; }
            let leave_start = row["startsAt"].as_str().and_then(|value| DateTime::parse_from_rfc3339(value).ok());
            let leave_end = row["endsAt"].as_str().and_then(|value| DateTime::parse_from_rfc3339(value).ok());
            leave_start.is_some_and(|value| value < ends) && leave_end.is_some_and(|value| value > starts)
        }) {
            return Err("برای این بازه مرخصی تأییدشده ثبت شده است".into());
        }
        let business_id = number(&snapshot, "businessId")?;
        let command_id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":command_id,"businessId":business_id,"module":"staff","action":"create_shift",
            "baseDataset":"shifts","baseSnapshotId":snapshot["snapshotId"],"baseRevision":snapshot["revision"],
            "payload":{"staffId":staff_id,"startsAt":starts.to_rfc3339(),"endsAt":ends.to_rfc3339(),"location":location.trim()}
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":command_id,"state":"pending","action":"create_shift","staffId":staff_id}))
    }

    pub fn enqueue_staff_leave_request_with_pin(
        &mut self,
        manager_pin: &str,
        staff_id: i64,
        starts_at: &str,
        ends_at: &str,
        kind: &str,
        reason: &str,
    ) -> Result<Value> {
        self.verify_local_manager_pin(manager_pin)?;
        if staff_id < 1 || !["personal", "sick", "unpaid"].contains(&kind) || reason.chars().count() > 500 {
            return Err("اطلاعات درخواست مرخصی معتبر نیست".into());
        }
        let starts = DateTime::parse_from_rfc3339(starts_at).map_err(err)?;
        let ends = DateTime::parse_from_rfc3339(ends_at).map_err(err)?;
        if ends <= starts || ends - starts > chrono::Duration::days(31) {
            return Err("بازهٔ مرخصی باید حداکثر ۳۱ روز باشد".into());
        }
        let snapshot = self.workspace_snapshot("shifts")?.ok_or_else(|| "نسخهٔ محلی کارکنان دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ برنامهٔ کارکنان منقضی است؛ ابتدا آن را تازه کنید".into());
        }
        let roster = snapshot["payload"]["staff"].as_array().ok_or("فهرست کارکنان محلی معتبر نیست")?;
        if !roster.iter().any(|row| row["id"].as_i64() == Some(staff_id)) {
            return Err("کارمند در نسخهٔ محلی پیدا نشد".into());
        }
        let from = DateTime::parse_from_rfc3339(snapshot["payload"]["range"]["from"].as_str().ok_or("ابتدای بازهٔ کارکنان پیدا نشد")?).map_err(err)?;
        let to = DateTime::parse_from_rfc3339(snapshot["payload"]["range"]["to"].as_str().ok_or("انتهای بازهٔ کارکنان پیدا نشد")?).map_err(err)?;
        if starts < from || ends > to {
            return Err("بازهٔ درخواست باید داخل بازهٔ ذخیره‌شدهٔ برنامهٔ کارکنان باشد".into());
        }
        let business_id = number(&snapshot, "businessId")?;
        let command_id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":command_id,"businessId":business_id,"module":"staff","action":"leave_request",
            "baseDataset":"shifts","baseSnapshotId":snapshot["snapshotId"],"baseRevision":snapshot["revision"],
            "payload":{"staffId":staff_id,"startsAt":starts.to_rfc3339(),"endsAt":ends.to_rfc3339(),"kind":kind,"reason":reason.trim()}
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":command_id,"state":"pending","action":"leave_request","staffId":staff_id}))
    }

    pub fn enqueue_staff_shift_change_with_pin(
        &mut self,
        manager_pin: &str,
        schedule_id: i64,
        target_staff_id: i64,
        reason: &str,
    ) -> Result<Value> {
        self.verify_local_manager_pin(manager_pin)?;
        if schedule_id < 1 || target_staff_id < 1 || reason.chars().count() > 300 {
            return Err("اطلاعات درخواست تعویض شیفت معتبر نیست".into());
        }
        let snapshot = self.workspace_snapshot("shifts")?.ok_or_else(|| "نسخهٔ محلی کارکنان دریافت نشده است".to_string())?;
        if snapshot["expired"].as_bool() == Some(true) {
            return Err("نسخهٔ برنامهٔ کارکنان منقضی است؛ ابتدا آن را تازه کنید".into());
        }
        let schedules = snapshot["payload"]["schedules"].as_array().ok_or("فهرست شیفت‌های محلی معتبر نیست")?;
        let shift = schedules.iter().find(|row| row["id"].as_i64() == Some(schedule_id)).ok_or("شیفت در نسخهٔ محلی پیدا نشد")?;
        if shift["status"].as_str() != Some("scheduled") {
            return Err("فقط برای شیفت برنامه‌ریزی‌شده می‌توان درخواست تعویض ثبت کرد".into());
        }
        let from_staff_id = number(shift, "staffId")?;
        if from_staff_id == target_staff_id {
            return Err("کارمند مقصد باید با صاحب فعلی شیفت متفاوت باشد".into());
        }
        let starts = DateTime::parse_from_rfc3339(shift["startsAt"].as_str().ok_or("زمان شروع شیفت پیدا نشد")?).map_err(err)?;
        if starts <= Utc::now() {
            return Err("برای شیفت شروع‌شده یا گذشته نمی‌توان درخواست تعویض ثبت کرد".into());
        }
        let roster = snapshot["payload"]["staff"].as_array().ok_or("فهرست کارکنان محلی معتبر نیست")?;
        if !roster.iter().any(|row| row["id"].as_i64() == Some(target_staff_id)) {
            return Err("کارمند مقصد در نسخهٔ محلی پیدا نشد".into());
        }
        let business_id = number(&snapshot, "businessId")?;
        let command_id = uuid::Uuid::new_v4().to_string();
        let command = json!({
            "schemaVersion":1,"id":command_id,"businessId":business_id,"module":"staff","action":"shift_change",
            "baseDataset":"shifts","baseSnapshotId":snapshot["snapshotId"],"baseRevision":snapshot["revision"],
            "payload":{"scheduleId":schedule_id,"targetStaffId":target_staff_id,"reason":reason.trim()}
        });
        self.enqueue_workspace_command(&command)?;
        Ok(json!({"commandId":command_id,"state":"pending","action":"shift_change","scheduleId":schedule_id,"targetStaffId":target_staff_id}))
    }

    pub fn workspace_staff_attendance_events(&self) -> Result<Value> {
        let business_id = self.paired_business_id()?;
        let reviews = self.workspace_snapshot("shifts")?.and_then(|snapshot| snapshot["payload"]["offlineAttendanceRequests"].as_array().cloned()).unwrap_or_default();
        let mut query = self.conn.prepare("SELECT id,action,state,error,payload,created_at FROM workspace_commands WHERE business_id=?1 AND module='staff' ORDER BY sequence DESC LIMIT 200").map_err(err)?;
        let rows = query.query_map([business_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, Vec<u8>>(4)?, row.get::<_, String>(5)?))).map_err(err)?;
        rows.map(|row| {
            let (id, action, state, error, payload, created_at) = row.map_err(err)?;
            let command = value(payload)?;
            let review = (action == "attendance").then(|| reviews.iter().find(|request| request["id"].as_str() == Some(id.as_str()))).flatten();
            Ok(json!({"commandId":id,"action":action,"state":state,"error":error,"reviewStatus":review.map(|value|value["status"].clone()).unwrap_or(Value::Null),"reviewNote":review.map(|value|value["reviewNote"].clone()).unwrap_or(Value::Null),"payload":command["payload"],"createdAt":created_at}))
        }).collect::<Result<Vec<_>>>().map(Value::Array)
    }

    pub fn workspace_menu_pending_changes(&self) -> Result<Value> {
        let business_id = self.paired_business_id()?;
        let mut query = self.conn.prepare("SELECT id,action,state,error,payload,created_at FROM workspace_commands WHERE business_id=?1 AND module='menu' AND state='pending' ORDER BY sequence").map_err(err)?;
        let rows = query.query_map([business_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, Vec<u8>>(4)?, row.get::<_, String>(5)?))
        }).map_err(err)?;
        rows.map(|row| {
            let (id, action, state, error, payload, created_at) = row.map_err(err)?;
            let command = value(payload)?;
            Ok(json!({"commandId":id,"action":action,"state":state,"error":error,"payload":command["payload"],"createdAt":created_at}))
        }).collect::<Result<Vec<_>>>().map(Value::Array)
    }

    pub fn claim_workspace_commands(&mut self, module: &str) -> Result<Vec<Value>> {
        if !["menu", "reservations", "staff", "inventory", "accounting", "receivables"].contains(&module) {
            return Err("همگام‌سازی این ماژول هنوز فعال نیست".into());
        }
        let business_id = self.paired_business_id()?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(err)?;
        let rows = {
            let mut q = tx.prepare("SELECT sequence,id,module,action,state,error,attempts,payload,created_at FROM workspace_commands WHERE business_id=?1 AND module=?2 AND state='pending' AND retry_at<=unixepoch() AND lease_until<=unixepoch() ORDER BY sequence LIMIT 20").map_err(err)?;
            let mapped = q
                .query_map(params![business_id,module], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, i64>(6)?,
                        r.get::<_, Vec<u8>>(7)?,
                        r.get::<_, String>(8)?,
                    ))
                })
                .map_err(err)?;
            let collected = mapped
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(err)?;
            collected
        };
        let mut claimed = Vec::new();
        for row in rows {
            let changed = tx.execute("UPDATE workspace_commands SET lease_until=unixepoch()+120 WHERE sequence=?1 AND state='pending' AND lease_until<=unixepoch()",[row.0]).map_err(err)?;
            if changed == 1 {
                claimed.push(row);
            }
        }
        tx.commit().map_err(err)?;
        claimed.into_iter().map(|(sequence,id,module,action,state,error,attempts,payload,created_at)| Ok(json!({"sequence":sequence,"id":id,"module":module,"action":action,"state":state,"error":error,"attempts":attempts,"command":value(payload)?,"createdAt":created_at}))).collect()
    }

    pub fn finish_workspace_command(
        &self,
        id: &str,
        receipt: Option<&str>,
        error: Option<&str>,
        failure_kind: &str,
    ) -> Result<()> {
        uuid::Uuid::parse_str(id).map_err(err)?;
        let business_id = self.paired_business_id()?;
        let message = error.unwrap_or("").chars().take(500).collect::<String>();
        let receipt = receipt.unwrap_or("").chars().take(1000).collect::<String>();
        if error.is_none() && receipt.is_empty() {
            return Err("تأیید همگام‌سازی بدون رسید سرور پذیرفته نمی‌شود".into());
        }
        let (state, retry_sql) = if error.is_none() {
            ("synced", "retry_at=0")
        } else {
            match failure_kind {
                "transient" => (
                    "pending",
                    "retry_at=unixepoch()+min(900,5*(1<<min(attempts,7)))",
                ),
                "conflict" => ("conflict", "retry_at=0"),
                "rejected" => ("rejected", "retry_at=0"),
                _ => return Err("نوع نتیجهٔ فرمان معتبر نیست".into()),
            }
        };
        let sql = format!("UPDATE workspace_commands SET state=?1,error=?2,server_receipt=?3,attempts=attempts+CASE WHEN ?1='synced' THEN 0 ELSE 1 END,lease_until=0,{retry_sql} WHERE id=?4 AND business_id=?5 AND state='pending'");
        let changed = self
            .conn
            .execute(&sql, params![state, message, receipt, id, business_id])
            .map_err(err)?;
        if changed == 0 {
            let existing: Option<(String, String)> = self
                .conn
                .query_row(
                    "SELECT state,server_receipt FROM workspace_commands WHERE id=?1 AND business_id=?2",
                    params![id,business_id],
                    |r| Ok((r.get(0)?,r.get(1)?)),
                )
                .optional()
                .map_err(err)?;
            if error.is_none()
                && existing.is_some_and(|(old_state, old_receipt)| {
                    old_state == "synced" && old_receipt == receipt
                })
            {
                return Ok(());
            }
            return Err(
                "فرمان در انتظار همگام‌سازی پیدا نشد یا نتیجه با رسید قبلی متفاوت است".into(),
            );
        }
        Ok(())
    }

    pub fn workspace_command_summary(&self) -> Result<Value> {
        let Some(business_id) = self
            .get("pairing")?
            .and_then(|pair| pair["businessId"].as_i64())
        else {
            return Ok(json!({"pending":0,"conflicts":0,"rejected":0,"synced":0,"recent":[]}));
        };
        let counts: (i64,i64,i64,i64) = self.conn.query_row(
            "SELECT sum(state='pending'),sum(state='conflict'),sum(state='rejected'),sum(state='synced') FROM workspace_commands WHERE business_id=?1",
            [business_id], |r| Ok((r.get::<_,Option<i64>>(0)?.unwrap_or(0),r.get::<_,Option<i64>>(1)?.unwrap_or(0),r.get::<_,Option<i64>>(2)?.unwrap_or(0),r.get::<_,Option<i64>>(3)?.unwrap_or(0))),
        ).map_err(err)?;
        let mut q = self.conn.prepare("SELECT sequence,id,module,action,state,error,attempts,created_at,base_snapshot_id,payload FROM workspace_commands WHERE business_id=?1 ORDER BY sequence DESC LIMIT 50").map_err(err)?;
        let rows = q.query_map([business_id],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?,r.get::<_,i64>(6)?,r.get::<_,String>(7)?,r.get::<_,Option<String>>(8)?,r.get::<_,Vec<u8>>(9)?))).map_err(err)?;
        let mut recent = Vec::new();
        for row in rows {
            let (sequence,id,module,action,state,error,attempts,created_at,base_snapshot_id,payload) = row.map_err(err)?;
            let mut item = json!({"sequence":sequence,"id":id,"module":module,"action":action,"state":state,"error":error,"attempts":attempts,"createdAt":created_at,"baseSnapshotId":base_snapshot_id});
            if module == "reservations" && action == "set_status" {
                let command = value(payload)?;
                item["reservationId"] = command["payload"]["reservationId"].clone();
                item["targetStatus"] = command["payload"]["status"].clone();
            }
            if module == "receivables" && action == "record_payment" {
                let command = value(payload)?;
                item["receivableId"] = command["payload"]["receivableId"].clone();
                item["amount"] = command["payload"]["amount"].clone();
            }
            recent.push(item);
        }
        Ok(json!({"pending":counts.0,"conflicts":counts.1,"rejected":counts.2,"synced":counts.3,"recent":recent}))
    }
    pub fn recover_prints(&self) -> Result<()> {
        self.conn.execute("UPDATE print_jobs SET state='unknown', error='برنامه هنگام ارسال بسته شد؛ قبل از چاپ مجدد خروج کاغذ را بررسی کنید' WHERE state='sending'", []).map_err(err)?;
        Ok(())
    }
    pub fn get(&self, key: &str) -> Result<Option<Value>> {
        self.conn
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
                r.get::<_, Vec<u8>>(0)
            })
            .optional()
            .map_err(err)?
            .map(value)
            .transpose()
    }
    pub fn set(&self, key: &str, v: &Value) -> Result<()> {
        self.conn.execute("INSERT INTO settings VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, blob(v)?]).map_err(err)?;
        Ok(())
    }
    pub fn pair(&self, config: &Value) -> Result<()> {
        if let Some(old) = self.get("pairing")? {
            if old["terminalId"] != config["terminalId"] {
                return Err(
                    "این پایگاه به صندوق دیگری متصل است؛ داده‌ها را با کلید جدید جایگزین نکنید"
                        .into(),
                );
            }
        }
        self.set("pairing", config)
    }
    pub fn save(&mut self, mut sale: Value) -> Result<Value> {
        let id = sale["id"].as_str().ok_or("شناسه فروش لازم است")?.to_string();
        uuid::Uuid::parse_str(&id).map_err(err)?;
        if let Some(existing) = self.sale(&id)? {
            for key in [
                "items",
                "type",
                "tableId",
                "customerName",
                "customerPhone",
                "note",
                "tender",
            ] {
                if existing[key] != sale[key] {
                    return Err(
                        "این شناسه قبلاً برای فیش دیگری ذخیره شده است؛ سوابق را بررسی کنید".into(),
                    );
                }
            }
            return Ok(existing);
        }
        let catalog = self
            .get("catalog")?
            .ok_or("ابتدا در زمان اتصال، منو را دریافت کنید")?;
        let deadline = DateTime::parse_from_rfc3339(catalog["validUntil"].as_str().unwrap_or(""))
            .map_err(err)?;
        let issued = DateTime::parse_from_rfc3339(catalog["issuedAt"].as_str().unwrap_or(""))
            .map_err(err)?;
        if Utc::now() > deadline || Utc::now() < issued - chrono::Duration::minutes(5) {
            return Err(
                "اعتبار منوی ذخیره‌شده تمام شده یا ساعت سیستم اشتباه است؛ اتصال را بررسی کنید"
                    .into(),
            );
        }
        sale["version"] = json!(1);
        sale["snapshotId"] = catalog["snapshotId"].clone();
        sale["occurredAt"] = json!(Utc::now().to_rfc3339());
        if !["dine_in", "takeaway"].contains(&sale["type"].as_str().unwrap_or("")) {
            return Err("نوع سفارش معتبر نیست".into());
        }
        if !sale["tableId"].is_null()
            && !catalog["tables"]
                .as_array()
                .ok_or("میزها نامعتبرند")?
                .iter()
                .any(|t| t["id"] == sale["tableId"])
        {
            return Err("میز معتبر نیست".into());
        }
        for (key, max) in [("customerName", 80), ("customerPhone", 20), ("note", 300)] {
            if sale[key].as_str().is_none_or(|s| s.chars().count() > max) {
                return Err("اطلاعات مشتری یا توضیح طولانی/نامعتبر است".into());
            }
        }
        let phone = sale["customerPhone"].as_str().unwrap_or("");
        if !phone.is_empty()
            && (phone.len() != 11
                || !phone.starts_with("09")
                || !phone.bytes().all(|b| b.is_ascii_digit()))
        {
            return Err("شماره مشتری باید موبایل ۱۱ رقمی باشد".into());
        }
        if !sale["customerName"].as_str().unwrap_or("").is_empty() && phone.is_empty() {
            return Err("شماره مشتری لازم است".into());
        }
        let (total, lines) = quote(&catalog, &sale)?;
        sale["total"] = json!(total);
        validate_tender(&sale["tender"], total, &catalog)?;
        let subtotal: i64 = lines.iter().map(|line| line["amount"].as_i64().unwrap_or(0)).sum();
        let tax = (subtotal as f64 * catalog["taxPercent"].as_f64().unwrap_or(0.0) / 100.0).round() as i64;
        let service = (subtotal as f64 * catalog["servicePercent"].as_f64().unwrap_or(0.0) / 100.0).round() as i64;
        let table_name = catalog["tables"].as_array().and_then(|tables| tables.iter().find(|table| table["id"] == sale["tableId"])).map(|table| table["name"].clone()).unwrap_or(Value::Null);
        let terminals = catalog["terminals"].as_array().map(|terminals| terminals.iter().map(|terminal| json!({"id":terminal["id"],"name":terminal["name"]})).collect::<Vec<_>>()).unwrap_or_default();
        let display_payload = json!({
            "businessName": catalog["name"],
            "occurredAt": sale["occurredAt"],
            "type": sale["type"],
            "tableId": sale["tableId"],
            "tableName": table_name,
            "customerName": sale["customerName"],
            "customerPhone": sale["customerPhone"],
            "note": sale["note"],
            "items": lines,
            "subtotal": subtotal,
            "tax": tax,
            "service": service,
            "total": total,
            "terminals": terminals
        });
        let count: i64 = self
            .conn
            .query_row(
                "SELECT count(*) FROM sales WHERE state!='synced'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if count >= 5000 {
            return Err("صف به سقف ۵۰۰۰ فروش رسیده؛ ابتدا همگام‌سازی کنید".into());
        }
        let routes = self.get("routes")?.unwrap_or(json!([]));
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute(
            "INSERT INTO sales(id,payload,created_at,display_payload) VALUES(?1,?2,?3,?4)",
            params![id, blob(&sale)?, sale["occurredAt"].as_str(), blob(&display_payload)?],
        )
        .map_err(err)?;
        for route in routes.as_array().ok_or("مسیر چاپ معتبر نیست")? {
            let code = route["code"].as_str().ok_or("کد چاپگر لازم است")?;
            let kitchen = route["kind"] == "kitchen";
            let selected: Vec<_> = lines
                .iter()
                .filter(|line| {
                    !kitchen
                        || route["categoryIds"]
                            .as_array()
                            .is_none_or(|ids| ids.is_empty() || ids.contains(&line["categoryId"]))
                })
                .collect();
            if selected.is_empty() {
                continue;
            }
            let mut content = format!("+----------------------------------------------+\n| {} |\n| فیش محلی {} |\n| {} |\n+----------------------------------------------+\n| شرح کالا | تعداد | تومان |\n+----------------------------------------------+\n", clean(catalog["name"].as_str().unwrap_or("MenuPeak")), &id[..8], if kitchen { "آشپزخانه" } else { "مشتری" });
            if let Some(table) = catalog["tables"]
                .as_array()
                .and_then(|ts| ts.iter().find(|t| t["id"] == sale["tableId"]))
            {
                content.push_str(&format!(
                    "| میز: {} |\n",
                    clean(table["name"].as_str().unwrap_or(""))
                ));
            }
            for line in selected {
                content.push_str(&format!(
                    "| {} | {} | {} |\n+----------------------------------------------+\n",
                    clean(line["name"].as_str().unwrap_or("")),
                    line["quantity"],
                    if kitchen {
                        String::new()
                    } else {
                        line["amount"].to_string()
                    }
                ));
            }
            content.push_str(&format!(
                "| زمان ثبت: {} |\n",
                clean(sale["occurredAt"].as_str().unwrap_or(""))
            ));
            if !kitchen && !sale["tender"].is_null() {
                content.push_str(&format!(
                    "| نقدی: {} · کارتخوان: {} تومان |\n| پیگیری: {} |\n",
                    sale["tender"]["cashAmount"],
                    sale["tender"]["posAmount"],
                    clean(sale["tender"]["posRefNo"].as_str().unwrap_or(""))
                ));
            }
            if !kitchen {
                content.push_str(&format!(
                    "| جمع با مالیات و خدمات: {total} تومان |\n| {} |\n",
                    if sale["tender"].is_null() {
                        "پرداخت نشده"
                    } else {
                        "دریافت وجه ثبت شد"
                    }
                ));
            }
            content.push_str(&format!(
                "| {} |\n+----------------------------------------------+\n",
                clean(sale["note"].as_str().unwrap_or(""))
            ));
            tx.execute(
                "INSERT INTO print_jobs(sale_id,code,content) VALUES(?1,?2,?3)",
                params![id, code, blob(&json!(content))?],
            )
            .map_err(err)?;
        }
        tx.execute("INSERT INTO settings VALUES('draft',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![blob(&Value::Null)?]).map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(sale)
    }
    pub fn sale(&self, id: &str) -> Result<Option<Value>> {
        self.conn
            .query_row("SELECT payload FROM sales WHERE id=?1", [id], |r| {
                r.get::<_, Vec<u8>>(0)
            })
            .optional()
            .map_err(err)?
            .map(value)
            .transpose()
    }
    pub fn pay(&mut self, id: &str, tender: Value) -> Result<()> {
        let tx = self.conn.transaction().map_err(err)?;
        let mut sale = value(
            tx.query_row("SELECT payload FROM sales WHERE id=?1", [id], |r| r.get(0))
                .map_err(err)?,
        )?;
        if !sale["tender"].is_null() {
            if sale["tender"] == tender {
                return Ok(());
            }
            return Err("دریافت وجه قبلاً ثبت شده است".into());
        }
        let config: Vec<u8> = tx
            .query_row("SELECT value FROM settings WHERE key='catalog'", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        validate_tender(&tender, number(&sale, "total")?, &value(config)?)?;
        if tender.is_null() {
            return Err("نوع دریافت را مشخص کنید".into());
        }
        sale["tender"] = tender;
        tx.execute("UPDATE sales SET payload=?1,revision=revision+1,state='pending',error='',retry_at=0 WHERE id=?2",params![blob(&sale)?,id]).map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(())
    }
    pub fn pending(&self) -> Result<Vec<Pending>> {
        let mut q=self.conn.prepare("SELECT id,revision,payload FROM sales WHERE state='pending' AND retry_at<=unixepoch() ORDER BY created_at LIMIT 20").map_err(err)?;
        let rows = q
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, Vec<u8>>(2)?,
                ))
            })
            .map_err(err)?;
        rows.map(|r| {
            let (id, revision, p) = r.map_err(err)?;
            Ok(Pending {
                id,
                revision,
                payload: value(p)?,
            })
        })
        .collect()
    }
    pub fn ack(&self, id: &str, revision: i64, number: i64) -> Result<()> {
        self.conn.execute("UPDATE sales SET state='synced',error='',server_number=?3 WHERE id=?1 AND revision=?2",params![id,revision,number]).map_err(err)?;
        Ok(())
    }
    pub fn fail(&self, id: &str, revision: i64, message: &str, conflict: bool) -> Result<()> {
        self.conn.execute("UPDATE sales SET state=?3,error=?4,attempts=attempts+1,retry_at=unixepoch()+min(300,5*(1<<min(attempts,6))) WHERE id=?1 AND revision=?2",params![id,revision,if conflict{"conflict"}else{"pending"},message]).map_err(err)?;
        Ok(())
    }
    pub fn retry(&self, id: &str) -> Result<()> {
        self.conn
            .execute(
                "UPDATE sales SET state='pending',retry_at=0 WHERE id=?1 AND state!='synced'",
                [id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn history(&self) -> Result<Value> {
        Ok(json!(self.history_page(0)?.0))
    }
    pub fn history_page(&self, offset: i64) -> Result<(Vec<Value>, bool)> {
        let mut q=self.conn.prepare("SELECT id,payload,state,error,server_number,display_payload FROM sales ORDER BY created_at DESC LIMIT 101 OFFSET ?1").map_err(err)?;
        let rows = q
            .query_map([offset.max(0)], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Vec<u8>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<Vec<u8>>>(5)?,
                ))
            })
            .map_err(err)?;
        let mut result = Vec::new();
        for r in rows {
            let (id, p, state, error, number, details) = r.map_err(err)?;
            let sale = value(p)?;
            let paid = !sale["tender"].is_null();
            let mut details = match details.map(value).transpose()? {
                Some(details) => details,
                None => json!({
                    "legacy": true,
                    "occurredAt": sale["occurredAt"],
                    "type": sale["type"],
                    "tableId": sale["tableId"],
                    "customerName": sale["customerName"],
                    "customerPhone": sale["customerPhone"],
                    "note": sale["note"],
                    "items": sale["items"],
                    "total": sale["total"]
                }),
            };
            details["tender"] = sale["tender"].clone();
            details["paid"] = json!(paid);
            details["serverNumber"] = number.map_or(Value::Null, |value| json!(value));
            result.push(json!({"id":id,"total":sale["total"],"paid":paid,"state":state,"error":error,"number":number,"at":sale["occurredAt"],"details":details}));
        }
        let has_more = result.len() > 100;
        result.truncate(100);
        Ok((result, has_more))
    }
    pub fn counts(&self) -> Result<Value> {
        let pending: i64 = self
            .conn
            .query_row(
                "SELECT count(*) FROM sales WHERE state='pending'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        let conflict: i64 = self
            .conn
            .query_row(
                "SELECT count(*) FROM sales WHERE state='conflict'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        let business_id = self.get("pairing")?.and_then(|p| p["businessId"].as_i64());
        let (workspace_pending, workspace_conflicts, workspace_rejected) = if let Some(id) =
            business_id
        {
            self.conn.query_row("SELECT sum(state='pending'),sum(state='conflict'),sum(state='rejected') FROM workspace_commands WHERE business_id=?1",[id],|r|Ok((r.get::<_,Option<i64>>(0)?.unwrap_or(0),r.get::<_,Option<i64>>(1)?.unwrap_or(0),r.get::<_,Option<i64>>(2)?.unwrap_or(0)))).map_err(err)?
        } else {
            (0, 0, 0)
        };
        Ok(
            json!({"pending":pending,"conflict":conflict,"workspacePending":workspace_pending,"workspaceConflicts":workspace_conflicts,"workspaceRejected":workspace_rejected}),
        )
    }
    pub fn print_jobs(&self) -> Result<Value> {
        let mut q = self
            .conn
            .prepare("SELECT id,code,state,error FROM print_jobs ORDER BY id DESC LIMIT 50")
            .map_err(err)?;
        let rows=q.query_map([],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"code":r.get::<_,String>(1)?,"state":r.get::<_,String>(2)?,"error":r.get::<_,String>(3)?}))).map_err(err)?;
        Ok(json!(rows
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?))
    }
    pub fn claim_print(&mut self) -> Result<Option<PrintJob>> {
        let tx = self.conn.transaction().map_err(err)?;
        let row = tx
            .query_row(
                "SELECT id,code,content FROM print_jobs WHERE state='pending' ORDER BY id LIMIT 1",
                [],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Vec<u8>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(err)?;
        let Some((id, code, p)) = row else {
            return Ok(None);
        };
        tx.execute("UPDATE print_jobs SET state='sending' WHERE id=?1", [id])
            .map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(Some(PrintJob {
            id,
            code,
            content: value(p)?.as_str().ok_or("فیش نامعتبر است")?.to_string(),
        }))
    }
    pub fn finish_print(&self, id: i64, error: Option<&str>) -> Result<()> {
        self.conn
            .execute(
                "UPDATE print_jobs SET state=?2,error=?3 WHERE id=?1",
                params![
                    id,
                    if error.is_some() { "unknown" } else { "sent" },
                    error.unwrap_or("")
                ],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn retry_print(&self, id: i64) -> Result<()> {
        self.conn
            .execute(
                "UPDATE print_jobs SET state='pending',error='' WHERE id=?1 AND state='unknown'",
                [id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn backup(&self, path: &Path) -> Result<()> {
        self.conn
            .backup(rusqlite::DatabaseName::Main, path, None)
            .map_err(err)
    }
}
pub fn validate_tender(t: &Value, total: i64, catalog: &Value) -> Result<()> {
    if t.is_null() {
        return Ok(());
    }
    let cash = number(t, "cashAmount")?;
    let pos = number(t, "posAmount")?;
    if cash < 0 || pos < 0 || cash + pos != total {
        return Err("جمع وجه نقد و کارتخوان باید برابر کل فاکتور باشد".into());
    }
    if pos > 0 {
        let reference = t["posRefNo"].as_str().unwrap_or("");
        if reference.len() < 4
            || reference.len() > 40
            || !reference
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err("شماره پیگیری واقعی کارتخوان لازم است".into());
        }
        if !catalog["terminals"]
            .as_array()
            .ok_or("کارتخوان تنظیم نشده")?
            .iter()
            .any(|p| p["id"] == t["posDeviceId"] && !p["settlementBankAccountId"].is_null())
        {
            return Err("کارتخوان با حساب تسویه تنظیم نشده است".into());
        }
    }
    Ok(())
}
pub fn quote(catalog: &Value, sale: &Value) -> Result<(i64, Vec<Value>)> {
    let items = sale["items"].as_array().ok_or("اقلام معتبر نیست")?;
    if items.is_empty() || items.len() > 50 {
        return Err("سبد باید بین ۱ تا ۵۰ قلم داشته باشد".into());
    }
    let products = catalog["products"].as_array().ok_or("منو معتبر نیست")?;
    let mut subtotal = 0i64;
    let mut lines = Vec::new();
    for item in items {
        let p = products
            .iter()
            .find(|p| p["id"] == item["productId"])
            .ok_or("محصول در منو موجود نیست")?;
        let qty = number(item, "quantity")?;
        if !(1..=50).contains(&qty) {
            return Err("تعداد معتبر نیست".into());
        }
        let mut price = number(p, "price")?;
        let base_price = price;
        if price <= 0 {
            return Err("محصول بدون قیمت قابل فروش نیست".into());
        }
        let selected = item["optionIds"].as_array().ok_or("گزینه‌ها معتبر نیست")?;
        let mut seen = std::collections::HashSet::new();
        for id in selected {
            if !seen.insert(id.as_str().ok_or("گزینه معتبر نیست")?) {
                return Err("گزینه تکراری است".into());
            }
        }
        let mut valid = std::collections::HashSet::new();
        let mut labels = Vec::new();
        let mut selected_options = Vec::new();
        for group in p["modifierGroups"]
            .as_array()
            .ok_or("گروه گزینه معتبر نیست")?
        {
            if group["active"] != true {
                continue;
            }
            let options = group["options"].as_array().ok_or("گزینه معتبر نیست")?;
            let mut count = 0;
            for option in options {
                if option["active"] != true {
                    continue;
                }
                let id = option["id"].as_str().ok_or("شناسه گزینه لازم است")?;
                valid.insert(id);
                if seen.contains(id) {
                    count += 1;
                    price += number(option, "priceDelta")?;
                    labels.push(option["name"].as_str().unwrap_or(""));
                    selected_options.push(json!({"name":option["name"],"priceDelta":option["priceDelta"]}));
                }
            }
            if count < number(group, "min")? || count > number(group, "max")? {
                return Err(format!("تعداد انتخاب در {} معتبر نیست", group["name"]));
            }
        }
        if !seen.is_subset(&valid) || price <= 0 {
            return Err("انتخاب یا قیمت گزینه نامعتبر است".into());
        }
        let amount = if p["sellingMode"] == "weight" {
            if !selected.is_empty() {
                return Err("محصول وزنی گزینه ندارد".into());
            }
            let gross = number(item, "weightGrams")?;
            let tare = number(item, "tareGrams")?;
            if !(1..=100_000).contains(&gross) || tare < 0 || tare >= gross {
                return Err("وزن ناخالص و ظرف معتبر نیست".into());
            }
            (((gross - tare) * price) as f64 / 1000.0).round() as i64 * qty
        } else {
            if !item["weightGrams"].is_null() {
                return Err("محصول تعدادی وزن ندارد".into());
            }
            price * qty
        };
        if amount <= 0 || amount > 2_147_483_647 {
            return Err("مبلغ قلم خارج از محدوده است".into());
        }
        subtotal += amount;
        lines.push(json!({
            "name":format!("{} {}",p["name"].as_str().unwrap_or(""),labels.join("، ")),
            "productName":p["name"],
            "optionNames":labels,
            "options":selected_options,
            "basePrice":base_price,
            "unitPrice":price,
            "quantity":qty,
            "weightGrams":item["weightGrams"],
            "tareGrams":item["tareGrams"],
            "amount":amount,
            "categoryId":p["categoryId"]
        }));
    }
    let tax = (subtotal as f64 * catalog["taxPercent"].as_f64().ok_or("مالیات نامعتبر")? / 100.0)
        .round() as i64;
    let service = (subtotal as f64 * catalog["servicePercent"].as_f64().ok_or("خدمات نامعتبر")?
        / 100.0)
        .round() as i64;
    let total = subtotal + tax + service;
    if !(1..=2_147_483_647).contains(&total) {
        return Err("مبلغ کل خارج از محدوده است".into());
    }
    Ok((total, lines))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Store, std::path::PathBuf, Value) {
        let path =
            std::env::temp_dir().join(format!("menupeak-test-{}.sqlite", uuid::Uuid::new_v4()));
        let store = Store::open(&path).unwrap();
        let catalog = json!({"version":1,"snapshotId":uuid::Uuid::new_v4().to_string(),"name":"کافه","issuedAt":Utc::now().to_rfc3339(),"validUntil":(Utc::now()+chrono::Duration::days(7)).to_rfc3339(),"taxPercent":10,"servicePercent":5,"products":[{"id":1,"name":"قهوه","price":1000,"categoryId":2,"sellingMode":"count","modifierGroups":[]}],"tables":[],"terminals":[{"id":3,"settlementBankAccountId":4}]});
        store.set("catalog", &catalog).unwrap();
        store
            .set(
                "routes",
                &json!([{"code":"printer","kind":"customer","categoryIds":[]}]),
            )
            .unwrap();
        let sale = json!({"id":uuid::Uuid::new_v4().to_string(),"type":"takeaway","tableId":null,"items":[{"productId":1,"quantity":2,"optionIds":[],"weightGrams":null,"tareGrams":0}],"customerName":"","customerPhone":"","note":"","tender":null});
        (store, path, sale)
    }
    #[test]
    fn durable_sale_and_print_survive_restart_and_duplicate_submission() {
        let (mut s, path, sale) = fixture();
        let saved = s.save(sale.clone()).unwrap();
        assert_eq!(saved["total"], 2300);
        s.save(sale.clone()).unwrap();
        assert_eq!(s.pending().unwrap().len(), 1);
        assert_eq!(s.print_jobs().unwrap().as_array().unwrap().len(), 1);
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(s.pending().unwrap()[0].payload["total"], 2300);
        assert!(s.get("draft").unwrap().unwrap().is_null());
    }
    #[test]
    fn invalid_tender_rolls_back_sale_and_print_together() {
        let (mut s, _, mut sale) = fixture();
        sale["tender"] = json!({"cashAmount":2000,"posAmount":0});
        assert!(s.save(sale).is_err());
        assert_eq!(s.pending().unwrap().len(), 0);
        assert_eq!(s.print_jobs().unwrap().as_array().unwrap().len(), 0);
    }
    #[test]
    fn late_ack_cannot_erase_a_new_payment_and_repeat_payment_is_idempotent() {
        let (mut s, _, sale) = fixture();
        s.save(sale.clone()).unwrap();
        let pending = s.pending().unwrap().remove(0);
        let tender = json!({"cashAmount":2300,"posAmount":0,"posDeviceId":null,"posRefNo":""});
        s.pay(&pending.id, tender.clone()).unwrap();
        s.pay(&pending.id, tender).unwrap();
        s.ack(&pending.id, pending.revision, 1001).unwrap();
        let next = s.pending().unwrap().remove(0);
        assert_eq!(next.revision, 1);
        assert_eq!(next.payload["tender"]["cashAmount"], 2300);
        s.ack(&next.id, next.revision, 1001).unwrap();
        assert!(s.pending().unwrap().is_empty());
    }
    #[test]
    fn ambiguous_print_does_not_retry_automatically_after_restart() {
        let (mut s, path, sale) = fixture();
        s.save(sale).unwrap();
        let id = s.claim_print().unwrap().unwrap().id;
        drop(s);
        let mut s = Store::open(&path).unwrap();
        s.recover_prints().unwrap();
        assert!(s.claim_print().unwrap().is_none());
        s.retry_print(id).unwrap();
        assert!(s.claim_print().unwrap().is_some());
    }
    #[test]
    fn immutable_sale_and_connection_identity_are_enforced() {
        let (mut s, _, mut sale) = fixture();
        s.save(sale.clone()).unwrap();
        sale["items"][0]["quantity"] = json!(3);
        assert!(s.save(sale).is_err());
        s.pair(&json!({"terminalId":"a"})).unwrap();
        assert!(s.pair(&json!({"terminalId":"b"})).is_err());
    }
    #[test]
    fn no_card_payment_without_real_reference_or_linked_terminal() {
        let (s, _, _) = fixture();
        let c = s.get("catalog").unwrap().unwrap();
        assert!(validate_tender(
            &json!({"cashAmount":0,"posAmount":2300,"posDeviceId":3,"posRefNo":""}),
            2300,
            &c
        )
        .is_err());
        assert!(validate_tender(
            &json!({"cashAmount":0,"posAmount":2300,"posDeviceId":9,"posRefNo":"123456"}),
            2300,
            &c
        )
        .is_err());
        assert!(validate_tender(
            &json!({"cashAmount":500,"posAmount":1800,"posDeviceId":3,"posRefNo":"123456"}),
            2300,
            &c
        )
        .is_ok());
    }
    #[test]
    fn expired_catalog_and_zero_price_cannot_create_sales() {
        let (mut s, _, sale) = fixture();
        let mut c = s.get("catalog").unwrap().unwrap();
        c["products"][0]["price"] = json!(0);
        s.set("catalog", &c).unwrap();
        assert!(s.save(sale.clone()).is_err());
        c["products"][0]["price"] = json!(1000);
        c["validUntil"] = json!((Utc::now() - chrono::Duration::hours(1)).to_rfc3339());
        s.set("catalog", &c).unwrap();
        assert!(s.save(sale).is_err());
    }
    #[test]
    fn backup_is_consistent_and_conflicts_are_retained() {
        let (mut s, _, sale) = fixture();
        s.save(sale).unwrap();
        let job = s.pending().unwrap().remove(0);
        s.fail(&job.id, 0, "تعارض", true).unwrap();
        assert!(s.pending().unwrap().is_empty());
        assert_eq!(s.counts().unwrap()["conflict"], 1);
        let path =
            std::env::temp_dir().join(format!("menupeak-backup-{}.sqlite", uuid::Uuid::new_v4()));
        s.backup(&path).unwrap();
        let copy = Store::open(&path).unwrap();
        assert!(copy.sale(&job.id).unwrap().is_some());
        s.retry(&job.id).unwrap();
        assert_eq!(s.pending().unwrap().len(), 1);
    }
    #[test]
    fn two_connections_cannot_duplicate_sale() {
        let (mut s, path, sale) = fixture();
        let mut other = Store::open(&path).unwrap();
        let sale2 = sale.clone();
        let handle = std::thread::spawn(move || other.save(sale2));
        let _ = s.save(sale);
        let _ = handle.join().unwrap();
        assert_eq!(s.history().unwrap().as_array().unwrap().len(), 1);
        assert_eq!(s.print_jobs().unwrap().as_array().unwrap().len(), 1);
    }
}
