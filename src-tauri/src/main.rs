// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use inputbot::KeybdKey::*;
use inputbot::MouseButton::LeftButton;
use std::thread::sleep;
use std::time::{Duration, SystemTime, Instant};
use tauri::Manager;
use winapi::um::winuser::GetKeyboardLayout;

#[derive(Clone, serde::Serialize)]
struct Payload {
    strafe_type: String,
    duration: u128,
    lmb_pressed: bool,
    first_key: String,
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

                // (strafe_type, duration, first_key)
                let mut pending_strafe: Option<(String, u128, String)> = None;
                let mut pending_strafe_time: Option<Instant> = None;

                let mut early_fired: bool = false;

                // Track when each key was pressed to determine overlap first key
                let mut left_press_instant: Option<Instant> = None;
                let mut right_press_instant: Option<Instant> = None;
                let mut overlap_first_key: Option<String> = None;

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

                    // Reset early_fired when both keys are fully released
                    if !left_pressed && !right_pressed {
                        early_fired = false;
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
                        left_press_instant = Some(Instant::now());
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
                                        // A is the counter key, so D was the first key
                                        if strafe_type == "Perfect" {
                                            pending_strafe = Some((strafe_type, duration, "D".to_string()));
                                            pending_strafe_time = Some(Instant::now());
                                        } else {
                                            // Late — emit immediately
                                            let _ = handle.emit_all("strafe", Payload {
                                                strafe_type,
                                                duration,
                                                lmb_pressed: lmb_during_strafe,
                                                first_key: "D".to_string(),
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
                        right_press_instant = Some(Instant::now());
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
                                        // D is the counter key, so A was the first key
                                        if strafe_type == "Perfect" {
                                            pending_strafe = Some((strafe_type, duration, "A".to_string()));
                                            pending_strafe_time = Some(Instant::now());
                                        } else {
                                            // Late — emit immediately
                                            let _ = handle.emit_all("strafe", Payload {
                                                strafe_type,
                                                duration,
                                                lmb_pressed: lmb_during_strafe,
                                                first_key: "A".to_string(),
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
                        // Determine which key was pressed first by comparing press instants
                        overlap_first_key = match (left_press_instant, right_press_instant) {
                            (Some(lp), Some(rp)) => {
                                if lp < rp { Some("A".to_string()) } else { Some("D".to_string()) }
                            }
                            (Some(_), None) => Some("A".to_string()),
                            (None, Some(_)) => Some("D".to_string()),
                            _ => Some("A".to_string()),
                        };
                    }

                    if (!left_pressed || !right_pressed) && both_pressed_time.is_some() {
                        if let Some(start) = both_pressed_time {
                            if let Ok(elapsed) = start.elapsed() {
                                // Only count strafe if W, S, Shift, and Ctrl are NOT pressed
                                if !w_pressed && !s_pressed && !shift_pressed && !ctrl_pressed {
                                    if !early_fired {
                                        // Take first_key before eval (eval resets both_pressed_time)
                                        let first_key = overlap_first_key.take().unwrap_or_else(|| "A".to_string());
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
                                                first_key,
                                            });
                                            lmb_during_strafe = false;
                                            early_fired = true;
                                        } else {
                                            // Overlap exceeded LATE_MAX_MS — reset without emitting
                                            both_pressed_time = None;
                                            lmb_during_strafe = false;
                                        }
                                    } else {
                                        // early_fired is true — skip this overlap, reset state only
                                        both_pressed_time = None;
                                        overlap_first_key = None;
                                        lmb_during_strafe = false;
                                    }
                                } else {
                                    both_pressed_time = None;
                                    overlap_first_key = None;
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
                    if let Some((ref strafe_type, duration, ref first_key)) = pending_strafe.clone() {
                        let lmb_now = LeftButton.is_pressed() || lmb_during_strafe;
                        let window_expired = pending_strafe_time
                            .map(|t| t.elapsed().as_millis() >= POST_STRAFE_LMB_WINDOW_MS)
                            .unwrap_or(true);

                        if lmb_now || window_expired {
                            let _ = handle.emit_all("strafe", Payload {
                                strafe_type: strafe_type.clone(),
                                duration,
                                lmb_pressed: lmb_now,
                                first_key: first_key.clone(),
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
