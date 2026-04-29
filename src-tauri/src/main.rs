// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use inputbot::KeybdKey::*;
use inputbot::MouseButton::LeftButton;
use std::thread::sleep;
use std::time::{Duration, SystemTime, Instant};
use tauri::AppHandle;
use tauri::Manager;
use winapi::um::winuser::GetKeyboardLayout;

#[derive(Clone, serde::Serialize)]
struct Payload {
    strafe_type: String,
    duration: u128,      // milliseconds
    lmb_pressed: bool,
}

const PERFECT_MAX_MS: u128 = 80;
const LATE_MAX_MS: u128 = 200;
const SPAM_COOLDOWN_MS: u128 = 60;
const POST_STRAFE_LMB_WINDOW_MS: u128 = 100;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();

            tauri::async_runtime::spawn(async move {
                let mut left_pressed = false;
                let mut right_pressed = false;
                let mut w_pressed = false;
                let mut s_pressed = false;
                let mut shift_pressed = false;
                let mut ctrl_pressed = false;

                let mut both_pressed_time: Option<SystemTime> = None;
                let mut right_released_time: Option<SystemTime> = None;
                let mut left_released_time: Option<SystemTime> = None;

                let mut lmb_during_strafe: bool = false;
                let mut last_strafe_time: Option<Instant> = None;

                let mut pending_strafe: Option<(String, u128)> = None;
                let mut pending_strafe_time: Option<Instant> = None;

                let is_azerty = is_azerty_layout();

                loop {
                    sleep(Duration::from_millis(2));

                    // W/S detection
                    if w_pressed && !WKey.is_pressed() { w_pressed = false; }
                    if s_pressed && !SKey.is_pressed() { s_pressed = false; }
                    if !w_pressed && WKey.is_pressed() { w_pressed = true; }
                    if !s_pressed && SKey.is_pressed() { s_pressed = true; }

                    // Shift / Ctrl detection (ignore strafes while sprinting or crouching)
                    if shift_pressed && !(LShiftKey.is_pressed() || RShiftKey.is_pressed()) {
                        shift_pressed = false;
                    }
                    if ctrl_pressed && !(LControlKey.is_pressed() || RControlKey.is_pressed()) {
                        ctrl_pressed = false;
                    }
                    if !shift_pressed && (LShiftKey.is_pressed() || RShiftKey.is_pressed()) {
                        shift_pressed = true;
                    }
                    if !ctrl_pressed && (LControlKey.is_pressed() || RControlKey.is_pressed()) {
                        ctrl_pressed = true;
                    }

                    // D released
                    if right_pressed && !DKey.is_pressed() && !RightKey.is_pressed() {
                        right_pressed = false;
                        let _ = handle.emit_all("d-released", ());
                        right_released_time = Some(SystemTime::now());
                    }

                    // A released (AZERTY support)
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
                    if ((!is_azerty && AKey.is_pressed()) || (is_azerty && QKey.is_pressed()) || LeftKey.is_pressed())
                        && !left_pressed
                    {
                        left_pressed = true;
                        let _ = handle.emit_all("a-pressed", ());

                        // Only count strafe if W, S, Shift, and Ctrl are NOT pressed
                        if !w_pressed && !s_pressed && !shift_pressed && !ctrl_pressed {
                            if let Some(x) = right_released_time {
                                if let Ok(elapsed) = x.elapsed() {
                                    if let Some((strafe_type, duration)) = eval_understrafe(
                                        elapsed,
                                        &mut right_released_time,
                                        &mut both_pressed_time,
                                        &mut lmb_during_strafe,
                                        &mut last_strafe_time,
                                    ) {
                                        if strafe_type == "Perfect" {
                                            pending_strafe = Some((strafe_type, duration));
                                            pending_strafe_time = Some(Instant::now());
                                        } else {
                                            // Late — emit immediately
                                            let _ = handle.emit_all("strafe", Payload {
                                                strafe_type,
                                                duration,
                                                lmb_pressed: lmb_during_strafe,
                                            });
                                            lmb_during_strafe = false;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // D pressed
                    if (DKey.is_pressed() || RightKey.is_pressed()) && !right_pressed {
                        right_pressed = true;
                        let _ = handle.emit_all("d-pressed", ());

                        // Only count strafe if W, S, Shift, and Ctrl are NOT pressed
                        if !w_pressed && !s_pressed && !shift_pressed && !ctrl_pressed {
                            if let Some(x) = left_released_time {
                                if let Ok(elapsed) = x.elapsed() {
                                    if let Some((strafe_type, duration)) = eval_understrafe(
                                        elapsed,
                                        &mut left_released_time,
                                        &mut both_pressed_time,
                                        &mut lmb_during_strafe,
                                        &mut last_strafe_time,
                                    ) {
                                        if strafe_type == "Perfect" {
                                            pending_strafe = Some((strafe_type, duration));
                                            pending_strafe_time = Some(Instant::now());
                                        } else {
                                            // Late — emit immediately
                                            let _ = handle.emit_all("strafe", Payload {
                                                strafe_type,
                                                duration,
                                                lmb_pressed: lmb_during_strafe,
                                            });
                                            lmb_during_strafe = false;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Overlap (Early) detection
                    if left_pressed && right_pressed && both_pressed_time.is_none() {
                        both_pressed_time = Some(SystemTime::now());
                        lmb_during_strafe = LeftButton.is_pressed();
                    }

                    if (!left_pressed || !right_pressed) && both_pressed_time.is_some() {
                        if let Some(start) = both_pressed_time {
                            if let Ok(elapsed) = start.elapsed() {
                                // Only count strafe if W, S, Shift, and Ctrl are NOT pressed
                                if !w_pressed && !s_pressed && !shift_pressed && !ctrl_pressed {
                                    if let Some((strafe_type, duration)) = eval_overstrafe(
                                        elapsed,
                                        &mut both_pressed_time,
                                        &mut lmb_during_strafe,
                                        &mut last_strafe_time,
                                    ) {
                                        // Early — emit immediately
                                        let _ = handle.emit_all("strafe", Payload {
                                            strafe_type,
                                            duration,
                                            lmb_pressed: lmb_during_strafe,
                                        });
                                        lmb_during_strafe = false;
                                    }
                                } else {
                                    both_pressed_time = None;
                                    lmb_during_strafe = false;
                                }
                            }
                        }
                    }

                    // Continuous LMB tracking during strafe window
                    if both_pressed_time.is_some() || left_released_time.is_some() || right_released_time.is_some() || pending_strafe.is_some() {
                        if LeftButton.is_pressed() {
                            lmb_during_strafe = true;
                        }
                    }

                    // Pending Perfect strafe resolution
                    if let Some((ref strafe_type, duration)) = pending_strafe.clone() {
                        let lmb_now = LeftButton.is_pressed() || lmb_during_strafe;
                        let window_expired = pending_strafe_time
                            .map(|t| t.elapsed().as_millis() >= POST_STRAFE_LMB_WINDOW_MS)
                            .unwrap_or(true);

                        if lmb_now || window_expired {
                            let _ = handle.emit_all("strafe", Payload {
                                strafe_type: strafe_type.clone(),
                                duration,
                                lmb_pressed: lmb_now,
                            });
                            pending_strafe = None;
                            pending_strafe_time = None;
                            lmb_during_strafe = false;
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run app");
}

fn eval_understrafe(
    elapsed: Duration,
    released_time: &mut Option<SystemTime>,
    both_pressed_time: &mut Option<SystemTime>,
    lmb_during: &mut bool,
    last_strafe_time: &mut Option<Instant>,
) -> Option<(String, u128)> {
    let time_passed_ms = elapsed.as_millis();
    if LeftButton.is_pressed() {
        *lmb_during = true;
    }

    // Anti-spam protection
    if let Some(last) = last_strafe_time {
        if last.elapsed().as_millis() < SPAM_COOLDOWN_MS {
            *released_time = None;
            return None;
        }
    }

    let strafe_type = if time_passed_ms <= PERFECT_MAX_MS {
        "Perfect"
    } else if time_passed_ms <= LATE_MAX_MS {
        "Late"
    } else {
        return None;
    };

    *released_time = None;
    *both_pressed_time = None;
    *lmb_during = false;
    *last_strafe_time = Some(Instant::now());
    Some((strafe_type.into(), time_passed_ms))
}

fn eval_overstrafe(
    elapsed: Duration,
    both_pressed_time: &mut Option<SystemTime>,
    lmb_during: &mut bool,
    last_strafe_time: &mut Option<Instant>,
) -> Option<(String, u128)> {
    let time_passed_ms = elapsed.as_millis();
    if LeftButton.is_pressed() {
        *lmb_during = true;
    }

    *both_pressed_time = None;
    *lmb_during = false;
    *last_strafe_time = Some(Instant::now());

    if time_passed_ms <= LATE_MAX_MS {
        Some(("Early".into(), time_passed_ms))
    } else {
        None
    }
}

fn is_azerty_layout() -> bool {
    unsafe {
        let layout = GetKeyboardLayout(0);
        let layout_id = layout as u32 & 0xFFFF;
        matches!(layout_id, 0x040C | 0x080C | 0x140C | 0x180C)
    }
}
