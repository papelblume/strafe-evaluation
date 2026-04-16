// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use inputbot::KeybdKey::*;
use inputbot::MouseButton::LeftButton; // ← NEW
use std::thread::sleep;
use std::time::{Duration, SystemTime};
use tauri::AppHandle;
use tauri::Manager;
use winapi::um::winuser::GetKeyboardLayout;

#[derive(Clone, serde::Serialize)]
struct Payload {
    strafe_type: String,
    duration: u128,
    lmb_pressed: bool,        // ← NEW: tell frontend if LMB was pressed
}

fn eval_understrafe(elapsed: Duration, released_time: &mut Option<SystemTime>, app: AppHandle) {
    let time_passed = elapsed.as_micros();
    let lmb_pressed = LeftButton.is_pressed();   // ← NEW

    if time_passed < (200 * 1000) && time_passed >= (100 * 1000) {
        app.emit_all(
            "strafe",
            Payload {
                strafe_type: "Late".into(),
                duration: time_passed,
                lmb_pressed,
            },
        )
        .unwrap();
    } else if time_passed < 100 * 1000 {
        app.emit_all(
            "strafe",
            Payload {
                strafe_type: "Perfect".into(),
                duration: time_passed,
                lmb_pressed: true, // Perfects always count
            },
        )
        .unwrap();
    }
    *released_time = None;
}

fn eval_overstrafe(elapsed: Duration, both_pressed_time: &mut Option<SystemTime>, app: AppHandle) {
    let time_passed = elapsed.as_micros();
    let lmb_pressed = LeftButton.is_pressed();   // ← NEW

    if time_passed < (200 * 1000) {
        app.emit_all(
            "strafe",
            Payload {
                strafe_type: "Early".into(),
                duration: time_passed,
                lmb_pressed,
            },
        )
        .unwrap();
    }
    *both_pressed_time = None;
}

fn is_azerty_layout() -> bool {
    unsafe {
        let layout = GetKeyboardLayout(0);
        let layout_id = layout as u32 & 0xFFFF;
        matches!(layout_id, 0x040C | 0x080C | 0x140C | 0x180C)
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();

            tauri::async_runtime::spawn(async move {
                let mut left_pressed = false;
                let mut right_pressed = false;
                let mut w_pressed = false;
                let mut s_pressed = false;

                let mut both_pressed_time: Option<SystemTime> = None;
                let mut right_released_time: Option<SystemTime> = None;
                let mut left_released_time: Option<SystemTime> = None;

                let is_azerty = is_azerty_layout();

                loop {
                    sleep(Duration::from_millis(1));

                    // ==================== W & S KEY DETECTION ====================
                    if w_pressed && !WKey.is_pressed() { w_pressed = false; }
                    if s_pressed && !SKey.is_pressed() { s_pressed = false; }

                    if !w_pressed && WKey.is_pressed() { w_pressed = true; }
                    if !s_pressed && SKey.is_pressed() { s_pressed = true; }
                    // ============================================================

                    // ==================== A & D KEY DETECTION ====================
                    // D released
                    if right_pressed && !DKey.is_pressed() && !RightKey.is_pressed() {
                        right_pressed = false;
                        let _ = handle.emit_all("d-released", ());
                        right_released_time = Some(SystemTime::now());
                    }

                    // A released (supports AZERTY Q)
                    if left_pressed
                        && (is_azerty || !AKey.is_pressed())
                        && (!is_azerty || !QKey.is_pressed())
                        && !LeftKey.is_pressed()
                    {
                        left_pressed = false;
                        let _ = handle.emit_all("a-released", ());
                        left_released_time = Some(SystemTime::now());
                    }

                    // A pressed
                    if ((!is_azerty && AKey.is_pressed())
                        || (is_azerty && QKey.is_pressed())
                        || LeftKey.is_pressed())
                        && !left_pressed
                    {
                        left_pressed = true;
                        let _ = handle.emit_all("a-pressed", ());

                        if !w_pressed && !s_pressed {
                            if let Some(x) = right_released_time {
                                if let Ok(elapsed) = x.elapsed() {
                                    eval_understrafe(elapsed, &mut right_released_time, handle.clone());
                                }
                            }
                        }
                    }

                    // D pressed
                    if (DKey.is_pressed() || RightKey.is_pressed()) && !right_pressed {
                        right_pressed = true;
                        let _ = handle.emit_all("d-pressed", ());

                        if !w_pressed && !s_pressed {
                            if let Some(x) = left_released_time {
                                if let Ok(elapsed) = x.elapsed() {
                                    eval_understrafe(elapsed, &mut left_released_time, handle.clone());
                                }
                            }
                        }
                    }
                    // ============================================================

                    // ==================== STRAFE EVALUATION ====================
                    if left_pressed && right_pressed && both_pressed_time.is_none() {
                        both_pressed_time = Some(SystemTime::now());
                    }

                    if (!left_pressed || !right_pressed) && both_pressed_time.is_some() {
                        if let Some(start) = both_pressed_time {
                            if let Ok(elapsed) = start.elapsed() {
                                if !w_pressed && !s_pressed {
                                    eval_overstrafe(elapsed, &mut both_pressed_time, handle.clone());
                                } else {
                                    both_pressed_time = None;
                                }
                            }
                        }
                    }
                    // ============================================================
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
