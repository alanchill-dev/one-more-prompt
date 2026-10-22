//! The actual Windows implementation against an isolated registry contract.
//! No real registry APIs, startup preferences, or login items are called.
extern crate self as winreg;
use std::{
    collections::HashMap,
    io,
    sync::{Mutex, OnceLock},
};
pub mod enums {
    pub const HKEY_CURRENT_USER: u32 = 1;
    pub const KEY_READ: u32 = 1;
    pub const KEY_SET_VALUE: u32 = 2;
    #[allow(non_camel_case_types)]
    pub enum RegType {
        REG_BINARY,
    }
}
pub struct RegValue {
    pub vtype: enums::RegType,
    pub bytes: Vec<u8>,
}
#[derive(Default)]
struct Registry {
    keys: HashMap<String, HashMap<String, String>>,
    denied: bool,
}
fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(Registry::default()))
}
pub struct RegKey(String);
impl RegKey {
    pub fn predef(_: u32) -> Self {
        Self(String::new())
    }
    pub fn open_subkey_with_flags(&self, path: &str, _: u32) -> io::Result<Self> {
        let state = registry().lock().unwrap();
        if state.denied {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        if !state.keys.contains_key(path) {
            return Err(io::ErrorKind::NotFound.into());
        }
        Ok(Self(path.into()))
    }
    pub fn create_subkey_with_flags(&self, path: &str, _: u32) -> io::Result<(Self, u32)> {
        let mut state = registry().lock().unwrap();
        if state.denied {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        state.keys.entry(path.into()).or_default();
        Ok((Self(path.into()), 0))
    }
    pub fn set_value<T: AsRef<str> + ?Sized, P: AsRef<str>>(
        &self,
        name: P,
        value: &T,
    ) -> io::Result<()> {
        registry()
            .lock()
            .unwrap()
            .keys
            .get_mut(&self.0)
            .unwrap()
            .insert(name.as_ref().into(), value.as_ref().into());
        Ok(())
    }
    pub fn set_raw_value<P>(&self, _: P, _: &RegValue) -> io::Result<()> {
        Ok(())
    }
    pub fn delete_value<P: AsRef<str>>(&self, name: P) -> io::Result<()> {
        let mut state = registry().lock().unwrap();
        if state
            .keys
            .get_mut(&self.0)
            .unwrap()
            .remove(name.as_ref())
            .is_none()
        {
            return Err(io::ErrorKind::NotFound.into());
        }
        Ok(())
    }
    pub fn get_value<T: From<String>, P: AsRef<str>>(&self, name: P) -> io::Result<T> {
        registry()
            .lock()
            .unwrap()
            .keys
            .get(&self.0)
            .unwrap()
            .get(name.as_ref())
            .cloned()
            .map(T::from)
            .ok_or(io::ErrorKind::NotFound.into())
    }
    pub fn get_raw_value<P>(&self, _: P) -> io::Result<RegValue> {
        Err(io::ErrorKind::NotFound.into())
    }
}
pub struct AutoLaunch {
    app_name: String,
    app_path: String,
    args: Vec<String>,
}
pub type Result<T> = io::Result<T>;
#[path = "../src/windows.rs"]
mod actual_windows;
#[path = "../src/startup_serialization.rs"]
mod startup_serialization;

#[test]
fn absent_run_key_can_enable_and_disable_without_changing_other_registrations() {
    *registry().lock().unwrap() = Registry::default();
    let app = AutoLaunch::new(
        "One More Prompt",
        r"C:\Synthetic Person\One More Prompt\app.exe",
        &["--background"],
    );
    assert!(!app.is_enabled().expect("an absent key means disabled"));
    app.disable()
        .expect("disabled is idempotent when key is absent");
    let invalid = AutoLaunch::new("One More Prompt", "invalid\"path.exe", &["--background"]);
    assert_eq!(
        invalid.enable().unwrap_err().kind(),
        io::ErrorKind::InvalidInput
    );
    assert!(
        registry().lock().unwrap().keys.is_empty(),
        "invalid input cannot create registration keys"
    );
    app.enable().expect("enable creates the per-user Run key");
    assert!(app.is_enabled().unwrap());
    let run = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    {
        let mut state = registry().lock().unwrap();
        let entries = state.keys.get_mut(run).unwrap();
        assert_eq!(
            entries["One More Prompt"],
            r#""C:\Synthetic Person\One More Prompt\app.exe" --background"#
        );
        entries.insert("Another App".into(), "do not touch".into());
    }
    app.disable().unwrap();
    app.disable().expect("missing value is also idempotent");
    assert!(!app.is_enabled().unwrap());
    assert_eq!(
        registry().lock().unwrap().keys[run]["Another App"],
        "do not touch"
    );
    registry().lock().unwrap().denied = true;
    for result in [app.is_enabled().map(|_| ()), app.enable(), app.disable()] {
        assert_eq!(
            result.unwrap_err().kind(),
            io::ErrorKind::PermissionDenied,
            "real permission failures remain visible"
        );
    }
}
