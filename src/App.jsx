import { createSignal, onMount, createEffect, onCleanup, For, createMemo } from "solid-js";
import "./App.css";
import { Chart, registerables } from 'chart.js';
import { Bar } from 'solid-chartjs';
import { listen } from '@tauri-apps/api/event';

function draw_time(time) {
  if (time < 0) return "-" + Math.abs(time).toFixed(0) + " ms";
  return time.toFixed(0) + " ms";
}

function getMeanAndVar(arr) {
  if (arr.length === 0) return { average: 0, std_deviation: 0 };
  const sum = arr.reduce((pre, cur) => pre + cur);
  const num = arr.length;
  const average = sum / num;
  let variance = 0;
  arr.forEach(n => { variance += (n - average) ** 2; });
  variance /= num;
  return { average, std_deviation: Math.sqrt(variance) };
}

function getStats(duration_array) {
  if (duration_array.length < 1) return { median: 0, min: 0, max: 0, average: 0, std_deviation: 0, samples: 0 };
  const absValues = duration_array.map(Math.abs);
  const sorted = [...absValues].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const o = getMeanAndVar(absValues);
  return { median, min: sorted[0], max: sorted[sorted.length - 1], average: o.average, std_deviation: o.std_deviation, samples: duration_array.length };
}

function getOccurance(duration_array, binSize = 5) {
  if (!duration_array || duration_array.length === 0) return new Array(61).fill(0);
  const out = new Array(61).fill(0);
  duration_array.forEach(x => {
    const bin = Math.round(x / binSize);
    const index = 20 + bin;
    if (index >= 0 && index < 61) out[index] += 1;
  });
  return out;
}

function fmtMs(ms) {
  if (ms === null || ms === undefined) return "...";
  return Math.round(Math.abs(ms)) + "ms";
}

function StrafePill(props) {
  const firstLabel = () => {
    if (!props.firstKey) return "?";
    return props.firstKey === "A" ? "L" : "R";
  };
  const secondLabel = () => {
    if (!props.firstKey) return "?";
    return props.firstKey === "A" ? "R" : "L";
  };

  return (
    <div className="flex-shrink-0 shadow-md select-none flex flex-col border border-dark/30 dark:border-bright/30 border-t bg-secondary/45 dark:bg-secondary/40 rounded-md justify-center items-center min-w-[76px] px-2 py-1 gap-0.5">
      <p className="font-bold text-center text-sm" style={{ color: props.color }}>{props.type}</p>
      <p className="text-center text-sm">{fmtMs(props.duration)}</p>
      <div class="w-full">
        <p className="text-left text-sm">{firstLabel()}: {fmtMs(props.firstKeyDurationMs)}</p>
        <p className="text-left text-sm">{secondLabel()}: {fmtMs(props.secondKeyDurationMs)}</p>
      </div>
    </div>
  );
}

function StatRow(props) {
  return (
    <tr>
      <th className="px-4">{props.label}</th>
      <td className="px-3 text-center">{draw_time(props.alls)}</td>
      <td className="px-3 text-center">{draw_time(props.early)}</td>
      <td className="px-3 text-center">{draw_time(props.perfect)}</td>
      <td className="px-3 text-center">{draw_time(props.late)}</td>
    </tr>
  );
}

function TooltipCell(props) {
  return (
    <td className="px-3 relative group cursor-default text-center">
      {props.display}
      <div className="absolute hidden group-hover:block bg-dark dark:bg-bright text-bright dark:text-dark text-xs px-2 py-1 rounded shadow-lg bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap z-50 pointer-events-none">
        {props.tooltip}
      </div>
    </td>
  );
}

function StatsTable(props) {
  const total = () => props.alls.samples;
  const p = (n) => total() > 0 ? Math.round((n / total()) * 100) : 0;

  const lmbTotal = () => props.lmbFired.samples;
  const pLMB = (n) => lmbTotal() > 0 ? Math.round((n / lmbTotal()) * 100) : 0;

  return (
    <table style="width:100%">
      <tbody className="text-center">
        <tr>
          <th className="px-4"></th>
          <th className="w-20 px-3">All</th>
          <th className="w-20 px-3 text-[#f16a5c]">Early</th>
          <th className="w-20 px-3 text-[#34d27a]">Perfect</th>
          <th className="w-20 px-3 text-[#f7b46f]">Late</th>
        </tr>
        <StatRow label="Median" alls={props.alls.median} early={props.early.median} perfect={props.perfect.median} late={props.late.median} />
        <StatRow label="Average" alls={props.alls.average} early={props.early.average} perfect={props.perfect.average} late={props.late.average} />
        <StatRow label="Min" alls={props.alls.min} early={props.early.min} perfect={props.perfect.min} late={props.late.min} />
        <StatRow label="Max" alls={props.alls.max} early={props.early.max} perfect={props.perfect.max} late={props.late.max} />
        <StatRow label="Std. Deviation" alls={props.alls.std_deviation} early={props.early.std_deviation} perfect={props.perfect.std_deviation} late={props.late.std_deviation} />

        {/* All Strafes row — Early/Perfect/Late cells show count tooltip on hover */}
        <tr>
          <th className="px-4">All Strafes</th>
          <td className="px-3 text-center">{props.alls.samples}</td>
          <TooltipCell
            display={`${p(props.early.samples)}%`}
            tooltip={`${props.early.samples} / ${props.alls.samples}`}
          />
          <TooltipCell
            display={`${p(props.perfect.samples)}%`}
            tooltip={`${props.perfect.samples} / ${props.alls.samples}`}
          />
          <TooltipCell
            display={`${p(props.late.samples)}%`}
            tooltip={`${props.late.samples} / ${props.alls.samples}`}
          />
        </tr>

        {/* Strafe+LMB row — Early/Perfect/Late cells show count tooltip on hover */}
        <tr className="font-medium border-t border-dark/30 dark:border-bright/30 bg-secondary/30 dark:bg-secondary/40">
          <th className="px-4 flex items-center gap-1.5 justify-start">
            Strafe+LMB
            <span className="relative group cursor-help">
              <span className="text-xs text-dark/60 dark:text-bright/60 select-none">ⓘ</span>
              <div className="absolute hidden group-hover:block bg-dark dark:bg-bright text-bright dark:text-dark text-xs px-3 py-2 rounded shadow-lg 
                              left-full ml-2 top-1/2 -translate-y-1/2 w-72 z-50 pointer-events-none">
                Counts only strafes where Left Mouse Button (LMB) was pressed during the strafe
              </div>
            </span>
          </th>
          <td className="px-3 text-center">{props.lmbFired.samples}</td>
          <TooltipCell
            display={`${pLMB(props.lmbFired.early)}%`}
            tooltip={`${props.lmbFired.early} / ${props.lmbFired.samples}`}
          />
          <TooltipCell
            display={`${pLMB(props.lmbFired.perfect)}%`}
            tooltip={`${props.lmbFired.perfect} / ${props.lmbFired.samples}`}
          />
          <TooltipCell
            display={`${pLMB(props.lmbFired.late)}%`}
            tooltip={`${props.lmbFired.late} / ${props.lmbFired.samples}`}
          />
        </tr>
      </tbody>
    </table>
  );
}

const MyChart = (props) => {
  const binSize = 5;
  const labels = createMemo(() => Array.from({ length: 61 }, (_, i) => (i - 20) * binSize));

  const [chartData, setChartData] = createSignal({
    labels: labels(),
    datasets: [
      { label: 'Early', data: [], borderRadius: 5, backgroundColor: "#f16a5c" },
      { label: 'Perfect', data: [], borderRadius: 5, backgroundColor: "#34d27a" },
      { label: 'Late', data: [], borderRadius: 5, backgroundColor: "#f7b46f" },
    ],
  });

  onMount(() => Chart.register(...registerables));

  createEffect(() => {
    setChartData({
      labels: labels(),
      datasets: [
        { label: 'Early', data: getOccurance(props.earlyStrafes, binSize), borderRadius: 5, backgroundColor: "#f16a5c" },
        { label: 'Perfect', data: getOccurance(props.perfectStrafes, binSize), borderRadius: 5, backgroundColor: "#34d27a" },
        { label: 'Late', data: getOccurance(props.lateStrafes, binSize), borderRadius: 5, backgroundColor: "#f7b46f" },
      ],
    });
  });

  const chartOptions = createMemo(() => {
    const textColor = props.isDark ? '#e8ead4' : '#25291e';
    const gridColor = props.isDark ? 'rgba(232,234,212,0.12)' : 'rgba(37,41,30,0.12)';
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: textColor, font: { size: 12 } }, grid: { color: gridColor } },
        y: { stacked: true, ticks: { color: textColor, font: { size: 12 } }, grid: { color: gridColor } }
      },
      plugins: { legend: { labels: { color: textColor } } }
    };
  });

  return <Bar data={chartData()} options={chartOptions()} />;
};

function WASD(props) {
  const [aPressed, setAPressed] = createSignal(false);
  const [dPressed, setDPressed] = createSignal(false);

  createEffect(() => {
    let unlistenA, unlistenD, unlistenReleaseA, unlistenReleaseD;
    const setupListeners = async () => {
      unlistenA = await listen('a-pressed', () => setAPressed(true));
      unlistenD = await listen('d-pressed', () => setDPressed(true));
      unlistenReleaseA = await listen('a-released', () => setAPressed(false));
      unlistenReleaseD = await listen('d-released', () => setDPressed(false));
    };
    onCleanup(() => {
      if (typeof unlistenA === "function") unlistenA();
      if (typeof unlistenD === "function") unlistenD();
      if (typeof unlistenReleaseA === "function") unlistenReleaseA();
      if (typeof unlistenReleaseD === "function") unlistenReleaseD();
    });
    setupListeners();
  });

  async function simulateEarly() { setAPressed(true); setTimeout(() => setDPressed(true), 500); setTimeout(() => setAPressed(false), 850); setTimeout(() => setDPressed(false), 1350); }
  async function simulateLate() { setAPressed(true); setTimeout(() => setAPressed(false), 500); setTimeout(() => setDPressed(true), 850); setTimeout(() => setDPressed(false), 1350); }
  async function simulatePerfect() { const delay = 40; setAPressed(true); setTimeout(() => setAPressed(false), 500); setTimeout(() => setDPressed(true), 500 + delay); setTimeout(() => setDPressed(false), 1000 + delay); }

  return (
    <div className="flex group justify-center items-center w-full h-full">
      <div className="flex flex-col basis-0 flex-grow items-end opacity-0 -translate-x-2 duration-200 group-hover:opacity-100 group-hover:translate-x-0">
        <button className="wasd-button text-white bg-[#e07e6f]" onClick={simulateEarly}>Early</button>
        <button className="wasd-button text-white bg-[#e8c38a]" onClick={simulateLate}>Late</button>
        <button className="wasd-button text-white bg-[#5fd38d]" onClick={simulatePerfect}>Perfect</button>
      </div>
      <div className="flex justify-center basis-0 flex-grow">
        <div className="select-none pointer-events-none text-dark dark:text-bright flex justify-between w-40 text-center font-bold text-xl">
          <div className={`flex border border-dark/20 dark:border-bright/20 border-r border-b shadow-lg border-b-dark/50 dark:border-b-bright/50 w-16 h-16 rounded-md justify-center items-center duration-75 transition-all ${aPressed() ? "bg-accent/70 scale-100 translate-y-[4px]" : "bg-secondary/10 dark:bg-secondary/20"}`}>
            <p>A</p>
          </div>
          <div className={`flex border border-dark/20 dark:border-bright/20 border-l border-b shadow-lg border-b-dark/50 dark:border-b-bright/50 w-16 h-16 rounded-md justify-center items-center duration-75 transition-all ${dPressed() ? "bg-accent/70 translate-y-[4px]" : "bg-secondary/10 dark:bg-secondary/20"}`}>
            <p>D</p>
          </div>
        </div>
      </div>
      <div className="basis-0 flex-grow min-w-[200px]"></div>
    </div>
  );
}

function App() {
  const [allStrafes, setAllStrafes] = createSignal([]);
  const [countOnlyLMB, setCountOnlyLMB] = createSignal(false);
  const [isDark, setIsDark] = createSignal(false);
  const [soundEnabled, setSoundEnabled] = createSignal({ Early: true, Perfect: true, Late: true });
  const [volume, setVolume] = createSignal(0.6);
  const [showVolumeTooltip, setShowVolumeTooltip] = createSignal(false);
  let volumeTooltipTimeout;

  const colorMap = {
    Early: "#f16a5c",
    Perfect: "#34d27a",
    Late: "#f7b46f"
  };

  let aPressTime = 0;
  let dPressTime = 0;
  let aReleaseDuration = 0;
  let dReleaseDuration = 0;
  let aIsHeld = false;
  let dIsHeld = false;
  let pendingFirstKeyStrafe = null;
  let pendingSecondKeyDuration = null;
  let strafeIdCounter = 0;

  let audioContext;

  onMount(() => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const savedVolume = localStorage.getItem('volume');
    if (savedVolume) setVolume(parseFloat(savedVolume));

    const savedRequireLMB = localStorage.getItem('requireLMB');
    if (savedRequireLMB !== null) setCountOnlyLMB(savedRequireLMB === 'true');

    const savedSound = localStorage.getItem('soundEnabled');
    if (savedSound) {
      try { setSoundEnabled(JSON.parse(savedSound)); } catch(e) {}
    }

    const saved = localStorage.getItem('theme');
    if (saved) setIsDark(saved === 'dark');
    else setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  createEffect(() => { localStorage.setItem('volume', volume().toString()); });
  createEffect(() => { localStorage.setItem('requireLMB', countOnlyLMB().toString()); });
  createEffect(() => { localStorage.setItem('soundEnabled', JSON.stringify(soundEnabled())); });

  createEffect(() => {
    if (isDark()) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  });

  const playBeep = (type) => {
    if (!soundEnabled()[type] || !audioContext) return;
    const osc  = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now  = audioContext.currentTime;

    if (type === "Perfect") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.connect(gain).connect(audioContext.destination);
      gain.gain.setValueAtTime(volume(), now);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
    } else if (type === "Late") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(640, now);
      osc.connect(gain).connect(audioContext.destination);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume(), now + 0.012);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
    } else if (type === "Early") {
      const filter = audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, now);
      filter.Q.setValueAtTime(0.8, now);
      osc.type = "square";
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.18);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume(), now + 0.012);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
    }
    osc.start(now);
    osc.stop(now + 0.2);
  };

  const toggleTheme = () => setIsDark(prev => !prev);

  function resetStrafes() {
    setAllStrafes([]);
    pendingFirstKeyStrafe = null;
    pendingSecondKeyDuration = null;
    strafeIdCounter = 0;
  }

  createEffect(() => {
    let unlistenAP, unlistenAR, unlistenDP, unlistenDR;
    const setup = async () => {
      unlistenAP = await listen('a-pressed', () => {
        aPressTime = Date.now();
        aIsHeld = true;
      });

      unlistenAR = await listen('a-released', () => {
        aReleaseDuration = Date.now() - aPressTime;
        aIsHeld = false;

        if (pendingFirstKeyStrafe?.firstKey === "A") {
          const id = pendingFirstKeyStrafe.id;
          const dur = aReleaseDuration;
          setAllStrafes(prev => {
            const idx = prev.findIndex(s => s.id === id);
            if (idx === -1) return prev;
            const copy = [...prev];
            copy[idx] = { ...copy[idx], firstKeyDurationMs: dur };
            return copy;
          });
          pendingFirstKeyStrafe = null;
        }

        const dur = aReleaseDuration;
        setAllStrafes(prev => {
          const idx = prev.findIndex(s => s.secondKeyDurationMs === null && s.firstKey === "D");
          if (idx === -1) {
            pendingSecondKeyDuration = { key: "A", duration: dur };
            return prev;
          }
          const copy = [...prev];
          copy[idx] = { ...copy[idx], secondKeyDurationMs: dur };
          return copy;
        });
      });

      unlistenDP = await listen('d-pressed', () => {
        dPressTime = Date.now();
        dIsHeld = true;
      });

      unlistenDR = await listen('d-released', () => {
        dReleaseDuration = Date.now() - dPressTime;
        dIsHeld = false;

        if (pendingFirstKeyStrafe?.firstKey === "D") {
          const id = pendingFirstKeyStrafe.id;
          const dur = dReleaseDuration;
          setAllStrafes(prev => {
            const idx = prev.findIndex(s => s.id === id);
            if (idx === -1) return prev;
            const copy = [...prev];
            copy[idx] = { ...copy[idx], firstKeyDurationMs: dur };
            return copy;
          });
          pendingFirstKeyStrafe = null;
        }

        const dur = dReleaseDuration;
        setAllStrafes(prev => {
          const idx = prev.findIndex(s => s.secondKeyDurationMs === null && s.firstKey === "A");
          if (idx === -1) {
            pendingSecondKeyDuration = { key: "D", duration: dur };
            return prev;
          }
          const copy = [...prev];
          copy[idx] = { ...copy[idx], secondKeyDurationMs: dur };
          return copy;
        });
      });
    };
    setup();
    onCleanup(() => {
      unlistenAP?.();
      unlistenAR?.();
      unlistenDP?.();
      unlistenDR?.();
    });
  });

  createEffect(() => {
    let unlisten;
    const setup = async () => {
      unlisten = await listen('strafe', (event) => {
        const { strafe_type: type, duration, lmb_pressed, first_key } = event.payload;
        const finalDuration = type === "Early" ? -duration : duration;

        const shouldCount = !countOnlyLMB() || lmb_pressed;
        if (!shouldCount) return;

        const fk = first_key || "A";
        const sk = fk === "A" ? "D" : "A";

        let firstKeyDurationMs = null;
        let needsPendingFirstKey = false;
        if (fk === "A") {
          if (!aIsHeld) {
            firstKeyDurationMs = aReleaseDuration;
          } else {
            needsPendingFirstKey = true;
          }
        } else {
          if (!dIsHeld) {
            firstKeyDurationMs = dReleaseDuration;
          } else {
            needsPendingFirstKey = true;
          }
        }

        let secondKeyDurationMs = null;
        if (pendingSecondKeyDuration?.key === sk) {
          secondKeyDurationMs = pendingSecondKeyDuration.duration;
          pendingSecondKeyDuration = null;
        }

        const id = ++strafeIdCounter;
        const strafeObj = {
          type,
          duration: finalDuration,
          lmb_pressed,
          firstKey: fk,
          firstKeyDurationMs,
          secondKeyDurationMs,
          id
        };

        setAllStrafes(prev => [strafeObj, ...prev]);

        if (needsPendingFirstKey) {
          pendingFirstKeyStrafe = { id, firstKey: fk };
        }

        playBeep(type);
      });
    };
    setup();
    onCleanup(() => unlisten?.());
  });

  const allStats = createMemo(() => {
    const allDurations = allStrafes().map(s => s.duration);
    const earlyDurations = allStrafes().filter(s => s.type === "Early").map(s => s.duration);
    const perfectDurations = allStrafes().filter(s => s.type === "Perfect").map(s => s.duration);
    const lateDurations = allStrafes().filter(s => s.type === "Late").map(s => s.duration);

    return {
      alls: getStats(allDurations),
      early: getStats(earlyDurations),
      perfect: getStats(perfectDurations),
      late: getStats(lateDurations)
    };
  });

  const lmbFired = createMemo(() => {
    const earlyLMB = allStrafes().filter(s => s.type === "Early" && s.lmb_pressed).length;
    const perfectLMB = allStrafes().filter(s => s.type === "Perfect" && s.lmb_pressed).length;
    const lateLMB = allStrafes().filter(s => s.type === "Late" && s.lmb_pressed).length;

    return {
      samples: earlyLMB + perfectLMB + lateLMB,
      early: earlyLMB,
      perfect: perfectLMB,
      late: lateLMB
    };
  });

  const recentStrafes = createMemo(() => allStrafes().slice(0, 100));
  const perfectCount = createMemo(() => allStrafes().filter(s => s.type === 'Perfect').length);

  return (
    <div class="w-screen h-screen bg-bright dark:bg-dark text-dark dark:text-bright flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-3 select-none">
        {/* Left: Title */}
        <div className="flex items-center">
          <h1 className="mr-3 drop-shadow-lg py-2 text-4xl pointer-events-none font-bold text-center text-dark dark:text-bright text-stroke italic">
            PatrikZero's
          </h1>
          <h1 className="py-2 text-4xl font-bold text-center pointer-events-none">
            Strafe Evaluation
          </h1>
        </div>

        {/* Center: Controls */}
        <div className="flex flex-col items-center gap-3 flex-1 max-w-md">
          {/* Row 1: Volume + Require LMB */}
          <div className="flex items-center gap-6 justify-center">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-dark/70 dark:text-bright/70 whitespace-nowrap">Vol:</span>
              <div className="relative flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume()}
                  onInput={(e) => {
                    setVolume(parseFloat(e.target.value));
                    clearTimeout(volumeTooltipTimeout);
                    setShowVolumeTooltip(true);
                    volumeTooltipTimeout = setTimeout(() => setShowVolumeTooltip(false), 1200);
                  }}
                  className="w-28 accent-primary"
                />
                {showVolumeTooltip() && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-dark dark:bg-bright text-bright dark:text-dark text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none z-50">
                    {Math.round(volume() * 100)}%
                  </div>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-xs group relative">
              <input
                type="checkbox"
                checked={countOnlyLMB()}
                onChange={(e) => setCountOnlyLMB(e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
              <span className="font-medium whitespace-nowrap">Require LMB</span>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block bg-dark dark:bg-bright text-bright dark:text-dark text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none">
                Only count strafes if Left Mouse Button is pressed during the strafe
              </div>
            </label>
          </div>

          {/* Row 2: Sound checkboxes */}
          <div className="flex gap-4 text-xs items-center">
            <span className="font-medium text-dark/70 dark:text-bright/70 whitespace-nowrap">Sound:</span>
            {Object.keys(soundEnabled()).map((t) => (
              <label key={t} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soundEnabled()[t]}
                  onChange={(e) => setSoundEnabled((prev) => ({ ...prev, [t]: e.target.checked }))}
                />
                <span
                  className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                  onClick={() => playBeep(t)}
                >
                  {t} 🔊
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Right: Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="px-6 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium shadow-md flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap"
        >
          {isDark() ? '☀️ Bright Mode' : '🌙 Dark Mode'}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-grow p-3 gap-4 overflow-hidden">

        {/* Statistics + Chart Row */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Statistics Panel */}
          <div className="flex flex-col w-[50%] rounded-xl border border-white/30 dark:border-white/10 p-4
                          bg-secondary/50 dark:bg-secondary/30 shadow-xl
                          max-h-[420px] text-[#3a3f36] dark:text-[#e8e8e8]">
            <div className="flex justify-between mb-4">
              <h2 className="select-none text-2xl font-bold">Statistics</h2>
              <button onClick={resetStrafes} className="text-bright select-none shadow-md px-5 py-1 rounded-md bg-primary hover:scale-110 active:scale-95 transition-all">Reset</button>
            </div>
            <div className="flex-1 overflow-auto">
              <StatsTable
                alls={allStats().alls}
                early={allStats().early}
                perfect={allStats().perfect}
                late={allStats().late}
                lmbFired={lmbFired()}
              />
            </div>
            <p className="pt-2 text-center italic font-bold text-lg text-[#34d27a]">
              Perfect {perfectCount()}x
            </p>
          </div>

          {/* Chart Panel */}
          <div className="flex flex-col w-[50%] bg-secondary/30 dark:bg-secondary/20 rounded-xl p-4 shadow-xl
                          max-h-[420px] flex-1">
            <div className="flex-1 min-h-0 w-full">
              <MyChart
                isDark={isDark()}
                earlyStrafes={allStrafes().filter(s => s.type === "Early").map(s => s.duration)}
                perfectStrafes={allStrafes().filter(s => s.type === "Perfect").map(s => s.duration)}
                lateStrafes={allStrafes().filter(s => s.type === "Late").map(s => s.duration)}
              />
            </div>
          </div>
        </div>

        {/* WASD Visualizer */}
        <div className="h-24 flex-shrink-0 flex items-center justify-center">
          <WASD colorMap={colorMap} />
        </div>

        {/* History Bar */}
        <div className="h-[140px] flex-shrink-0 flex flex-row p-3 bg-accent/25 dark:bg-accent/20 overflow-x-auto w-full gap-3 scrollbar-hide rounded-xl">
          <For each={recentStrafes()}>
            {(strafe) => (
              <StrafePill
                type={strafe.type}
                duration={strafe.duration}
                color={colorMap[strafe.type]}
                firstKey={strafe.firstKey}
                firstKeyDurationMs={strafe.firstKeyDurationMs}
                secondKeyDurationMs={strafe.secondKeyDurationMs}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

export default App;
