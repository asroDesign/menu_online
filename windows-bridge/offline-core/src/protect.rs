// DPAPI binds credentials and customer/sale payloads to the current Windows login.
// The non-Windows implementation is only for core tests/development.
#[cfg(windows)]
#[repr(C)]
struct Blob {
    len: u32,
    data: *mut u8,
}
#[cfg(windows)]
#[link(name = "crypt32")]
extern "system" {
    fn CryptProtectData(
        input: *const Blob,
        description: *const u16,
        entropy: *const Blob,
        reserved: *mut u8,
        prompt: *mut u8,
        flags: u32,
        output: *mut Blob,
    ) -> i32;
    fn CryptUnprotectData(
        input: *const Blob,
        description: *mut *mut u16,
        entropy: *const Blob,
        reserved: *mut u8,
        prompt: *mut u8,
        flags: u32,
        output: *mut Blob,
    ) -> i32;
}
#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn LocalFree(ptr: *mut u8) -> *mut u8;
}
#[cfg(windows)]
fn crypt(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    let input = Blob {
        len: data
            .len()
            .try_into()
            .map_err(|_| "داده بیش از حد بزرگ است")?,
        data: data.as_ptr() as *mut u8,
    };
    let mut output = Blob {
        len: 0,
        data: null_mut(),
    };
    unsafe {
        let ok = if encrypt {
            CryptProtectData(
                &input,
                null(),
                null(),
                null_mut(),
                null_mut(),
                1,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null_mut(),
                null_mut(),
                1,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("حفاظت داده Windows ناموفق بود؛ با همان حساب Windows وارد شوید".into());
        }
        let bytes = std::slice::from_raw_parts(output.data, output.len as usize).to_vec();
        LocalFree(output.data);
        Ok(bytes)
    }
}
pub fn seal(data: &[u8]) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        crypt(data, true)
    }
    #[cfg(not(windows))]
    {
        Ok(data.to_vec())
    }
}
pub fn open(data: &[u8]) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        crypt(data, false)
    }
    #[cfg(not(windows))]
    {
        Ok(data.to_vec())
    }
}
