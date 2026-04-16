// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use inputbot::KeybdKey::*;
use inputbot::MouseButton::LeftButton;
use std::thread::sleep;
use std::time::{Duration, SystemTime};
use tauri::AppHandle;
use tauri::Manager;
use winapi::um::winuser::GetKeyboardLayout;

#[derive(Clone, serde::Serialize)]
struct Payload {
    strafe_type: String,
    duration: u128,
    lmb_pressed: bool,        // true = LMB was pressed at any time during the strafe
}

fn eval_understrafe(
    elapsed: Duration,
    released_time: &mut Option<SystemTime>,
    app: AppHandle,
    both_pressed_time: &mut Option<SystemTime>,
    lmb_during: &mut bool,   // NEW: track if LMB was pressed during this understrafe
) {
    let time_passed = elapsed.as_micros();
    let lmb_now = LeftButton.is_pressed();
    if lmb_now {
        *lmb_during = true;
    }

    if time_passed < (200 * 1000) && time_passed >= (100 * 1000) {
        // Late
        let _ = app.emit_all(
            "strafe",
            Payload {
                strafe_type: "Late".into(),
                duration: time_passed,
                lmb_pressed: *lmb_during,
            },
        );
    } else if time_passed < 100 * 1000 {
        // Perfect
        let _ = app.emit_all(
            "strafe",
            Payload {
                strafe_type: "Perfect".into(),
                duration: time_passed,
                lmb_pressed: true,
            },
        );
        *both_pressed_time = None;
    }
    *released_time = None;
    *lmb_during = false;  // reset for next strafe
}

fn eval_overstrafe(
    elapsed: Duration,
    both_pressed_time: &mut Option<SystemTime>,
    app: AppHandle,
    lmb_during: &mut bool,   // NEW
) {
    let time_passed = elapsed.as_micros();
    let lmb_now = LeftButton.is_pressed();
    if lmb_now {
        *lmb_during = true;
    }

    if time_passed < (200 * 1000) {
        app.emit_all(
            "strafe",
            Payload {
                strafe_type: "Early".into(),
                duration: time_passed,
                lmb_pressed: *lmb_during,
            },
        )
        .unwrap();
    }
    *both_pressed_time = None;
    *lmb_during = false;  // reset
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

                let mut lmb_during_strafe: bool = false;   // ← NEW: tracks LMB during current strafe window

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
                                    eval_understrafe(elapsed, &mut right_released_time, handle.clone(), &mut both_pressed_time, &mut lmb_during_strafe);
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
                                    eval_understrafe(elapsed, &mut left_released_time, handle.clone(), &mut both_pressed_time, &mut lmb_during_strafe);
                                }
                            }
                        }
                    }
                    // ============================================================

                    // ==================== STRAFE EVALUATION (Early / Overlap) ====================
                    if left_pressed && right_pressed && both_pressed_time.is_none() {
                        both_pressed_time = Some(SystemTime::now());
                        lmb_during_strafe = LeftButton.is_pressed(); // initial state
                    }

                    if (!left_pressed || !right_pressed) && both_pressed_time.is_some() {
                        if let Some(start) = both_pressed_time {
                            if let Ok(elapsed) = start.elapsed() {
                                if !w_pressed && !s_pressed {
                                    eval_overstrafe(elapsed, &mut both_pressed_time, handle.clone(), &mut lmb_during_strafe);
                                } else {
                                    both_pressed_time = None;
                                    lmb_during_strafe = false;
                                }
                            }
                        }
                    }
                    // ============================================================

                    // Continuously update LMB flag while a strafe window is active
                    if (both_pressed_time.is_some() || left_released_time.is_some() || right_released_time.is_some()) {
                        if LeftButton.is_pressed() {
                            lmb_during_strafe = true;
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
