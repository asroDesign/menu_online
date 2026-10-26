mod protect;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::Path;
pub type Result<T> = std::result::Result<T, String>;
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
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY, payload BLOB NOT NULL, revision INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, server_number INTEGER, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS print_jobs(id INTEGER PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), code TEXT NOT NULL, content BLOB NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '');
        PRAGMA user_version=1;").map_err(err)?;
        Ok(Self { conn })
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
            "INSERT INTO sales(id,payload,created_at) VALUES(?1,?2,?3)",
            params![id, blob(&sale)?, sale["occurredAt"].as_str()],
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
        let mut q=self.conn.prepare("SELECT id,payload,state,error,server_number FROM sales ORDER BY created_at DESC LIMIT 100").map_err(err)?;
        let rows = q
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Vec<u8>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                ))
            })
            .map_err(err)?;
        let mut result = Vec::new();
        for r in rows {
            let (id, p, state, error, number) = r.map_err(err)?;
            let sale = value(p)?;
            result.push(json!({"id":id,"total":sale["total"],"paid":!sale["tender"].is_null(),"state":state,"error":error,"number":number,"at":sale["occurredAt"]}));
        }
        Ok(json!(result))
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
        Ok(json!({"pending":pending,"conflict":conflict}))
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
        lines.push(json!({"name":format!("{} {}",p["name"].as_str().unwrap_or(""),labels.join("، ")),"quantity":qty,"amount":amount,"categoryId":p["categoryId"]}));
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
