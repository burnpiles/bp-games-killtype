import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/jetbrains-mono/700.css';
import './game.css';
import { audio } from './audio';
import { track } from './analytics';
import { DIFFICULTIES, DIFFICULTY_CONFIG, WEAPONS, type Difficulty } from './config';
import { Game, type LevelSummary, type RunStats } from './engine';
import { spriteThumb } from './sprites';
import { ENEMIES, WORLD_ORDER, WORLDS, type EnemyKind, type LevelInfo, type SpriteKey, type WorldId } from './worlds';
import { Renderer } from './render';
import {
  emptyBoards, fetchBoards, qualify, startRun, submit,
  type Boards, type LeaderboardEntry, type Qualification,
} from './leaderboard';

type Screen = 'home' | 'world' | 'leaderboard' | 'faq' | 'playing' | 'over';

const thumbCache = new Map<string, string>();
function thumb(key: SpriteKey, px = 4) {
  const k = `${key}@${px}`;
  let v = thumbCache.get(k);
  if (!v) { v = spriteThumb(key, px); thumbCache.set(k, v); }
  return v;
}

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 1100));

function useMuted() {
  return useSyncExternalStore(cb => audio.subscribe(cb), () => audio.muted, () => false);
}

type KbGap = 'auto' | 'off' | 'small' | 'medium' | 'large';
const KB_GAPS: { id: KbGap; label: string }[] = [
  { id: 'auto', label: 'Auto' }, { id: 'off', label: 'Off' }, { id: 'small', label: 'S' }, { id: 'medium', label: 'M' }, { id: 'large', label: 'L' },
];

/** How much of the bottom of the viewport the on-screen keyboard covers, in CSS px. */
function keyboardInset(mode: KbGap, kb: { open: boolean; overlay: boolean }, w: number, h: number): number {
  if (!kb.open || mode === 'off') return 0;
  if (mode !== 'auto') return Math.round(h * (mode === 'small' ? 0.3 : mode === 'medium' ? 0.4 : 0.5));
  if (!kb.overlay) return 0; // the browser already shrank the viewport for us
  const a = window.screen?.width || w, b = window.screen?.height || h;
  const landscape = w > h;
  const sw = Math.min(a, b);
  const sh = landscape ? Math.min(a, b) : Math.max(a, b);
  const tablet = sw >= 600;
  const frac = tablet ? (landscape ? 0.42 : 0.31) : (landscape ? 0.55 : 0.39);
  const est = Math.max(tablet ? 300 : 240, sh * frac);
  return Math.round(Math.min(est, h * 0.62));
}

export function KillType() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gameRef = useRef<Game>(new Game());
  const rendererRef = useRef<Renderer | null>(null);
  const runTokenRef = useRef<Promise<string | null> | null>(null);
  const composingRef = useRef(false);
  const prevValueRef = useRef('');

  const [screen, setScreen] = useState<Screen>('home');
  const [paused, setPaused] = useState(false);
  const [touch, setTouch] = useState(isTouchDevice);
  const [difficulty, setDifficulty] = useState<Difficulty>('hard');
  const [world, setWorld] = useState<WorldId>(() => { try { return (localStorage.getItem('killtype.world') as WorldId) || 'mall'; } catch { return 'mall'; } });
  const [intro, setIntro] = useState<{ info: LevelInfo; summary: LevelSummary | null } | null>(null);
  const [scoreTip, setScoreTip] = useState(false);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [boards, setBoards] = useState<Boards>(emptyBoards);
  const [boardTab, setBoardTab] = useState<Difficulty>('hard');
  const [boardState, setBoardState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [qual, setQual] = useState<Qualification | null>(null);
  const [qualState, setQualState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [name, setName] = useState(() => { try { return localStorage.getItem('killtype.name') ?? ''; } catch { return ''; } });
  const [submitted, setSubmitted] = useState<(LeaderboardEntry & { rank: number }) | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const muted = useMuted();
  const [kbGap, setKbGap] = useState<KbGap>(() => { try { return (localStorage.getItem('killtype.kbgap') as KbGap) || 'auto'; } catch { return 'auto'; } });
  const kbGapRef = useRef(kbGap);
  kbGapRef.current = kbGap;
  /** Keyboard bookkeeping: tallest unobstructed viewport, whether the keyboard is up, and the auto-detected overlap. */
  const kbRef = useRef({ baseH: 0, baseW: 0, open: false, overlay: false, timer: 0 as any });
  const relayoutRef = useRef<() => void>(() => {});
  useEffect(() => { relayoutRef.current(); }, [kbGap]);

  const screenRef = useRef(screen);
  screenRef.current = screen;
  const introRef = useRef(intro);
  introRef.current = intro;
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;
  const touchRef = useRef(touch);
  touchRef.current = touch;

  // ---------- layout: track the *visual* viewport so the on-screen keyboard never covers play ----------
  useEffect(() => {
    const game = gameRef.current;
    const renderer = new Renderer(canvasRef.current!, game);
    rendererRef.current = renderer;
    if (import.meta.env.DEV) (window as any).__kt = game;
    let lastKey = '';
    const apply = () => {
      const vv = window.visualViewport;
      const w = Math.round(vv?.width ?? window.innerWidth);
      const fullH = Math.round(vv?.height ?? window.innerHeight);
      const top = Math.round(vv?.offsetTop ?? 0);
      // device-mode toggles and hidden iframes briefly report a 0px viewport
      if (w < 2 || fullH < 2) return;
      const kb = kbRef.current;
      if (w !== kb.baseW) { kb.baseW = w; kb.baseH = fullH; }
      if (!kb.open) kb.baseH = Math.max(kb.baseH, fullH);
      const h = Math.max(160, fullH - keyboardInset(kbGapRef.current, kb, w, fullH));
      const stage = stageRef.current;
      if (stage) {
        stage.style.width = `${w}px`;
        stage.style.height = `${h}px`;
        stage.style.transform = `translateY(${top}px)`;
      }
      const t = isTouchDevice();
      setTouch(t);
      const compact = t || w < 640 || h < 560;
      const dpr = Math.min(window.devicePixelRatio || 1, compact ? 2 : 2.5);
      const key = `${w}x${h}@${dpr}:${compact}`;
      if (key === lastKey) return;
      lastKey = key;
      game.setLayout(w, h, compact);
      renderer.resize(w, h, dpr);
    };
    apply();
    relayoutRef.current = () => { lastKey = ''; apply(); };
    const onScroll = () => {
      // iOS scrolls the page to "reveal" a focused input; pin it back.
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
      apply();
    };
    window.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll);
    document.fonts?.addEventListener?.('loadingdone', () => renderer.fontsChanged());
    document.fonts?.ready.then(() => renderer.fontsChanged());
    return () => {
      window.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // ---------- main loop ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // a single bad frame must never stop the loop (that is a black screen)
      try { gameRef.current.update(dt); } catch (e) { console.error(e); }
      try { rendererRef.current?.draw(dt); } catch (e) { console.error(e); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- engine events ----------
  useEffect(() => {
    const game = gameRef.current;
    game.onEvent = (e) => {
      if (e.type === 'pause') setPaused(e.paused);
      if (e.type === 'intro') {
        setIntro({ info: e.info, summary: e.summary });
        if (e.summary) {
          const sm = e.summary;
          track('boss_kill', { boss: sm.boss, world: sm.worldName, level: sm.level });
          track('level_complete', { world: sm.worldName, level: sm.level, level_name: sm.name, global_level: sm.globalLevel, level_score: sm.score, score: sm.totalScore, accuracy: sm.accuracyPct, difficulty: gameRef.current.difficulty });
        }
        if (e.summary) audio.setIntensity(0, false);
      }
      if (e.type === 'gameover') {
        setStats(e.stats);
        const st = e.stats;
        track('game_over', { score: st.score, level: st.level, world: st.world, level_name: st.levelName, difficulty: st.difficulty, wpm: st.wpm, accuracy: st.accuracyPct, kills: st.kills, max_combo: st.maxCombo, duration_s: Math.round(st.durationMs / 1000) });
        audio.setIntensity(0, false);
        setScreen('over');
        setPaused(false);
        setIntro(null);
        inputRef.current?.blur();
      }
    };
  }, []);

  const refreshBoards = useCallback(async () => {
    setBoardState('loading');
    try { setBoards(await fetchBoards()); setBoardState('idle'); }
    catch { setBoardState('error'); }
  }, []);
  useEffect(() => { refreshBoards(); }, [refreshBoards]);

  // game-over: check qualification
  useEffect(() => {
    if (screen !== 'over' || !stats) return;
    setQual(null); setSubmitted(null); setSubmitError('');
    setBoardTab(stats.difficulty);
    refreshBoards();
    if (stats.score <= 0) return;
    setQualState('loading');
    qualify({ score: stats.score, difficulty: stats.difficulty, wpm: stats.wpm, accuracyPct: stats.accuracyPct })
      .then(q => { setQual(q); setQualState('idle'); })
      .catch(() => setQualState('error'));
  }, [screen, stats, refreshBoards]);

  // ---------- focus helpers (must run synchronously inside a gesture on iOS) ----------
  const focusTyping = useCallback(() => {
    if (!touchRef.current) return;
    const el = inputRef.current;
    if (!el) return;
    el.value = '';
    prevValueRef.current = '';
    el.focus({ preventScroll: true });
  }, []);

  /** Difficulty picked: next, choose where to start. */
  const chooseDifficulty = useCallback((d: Difficulty) => {
    audio.unlock();
    audio.uiClick();
    audio.startMusic();
    setDifficulty(d);
    setScreen('world');
  }, []);

  const begin = useCallback((d: Difficulty, w: WorldId) => {
    audio.unlock();
    audio.uiClick();
    audio.startMusic();
    setDifficulty(d);
    setWorld(w);
    try { localStorage.setItem('killtype.world', w); } catch { /* ignore */ }
    track('game_start', { difficulty: d, world: w, device: isTouchDevice() ? 'touch' : 'keyboard' });
    setStats(null);
    setPaused(false);
    setScreen('playing');
    gameRef.current.start(d, w);
    runTokenRef.current = startRun(d);
    inputRef.current?.blur();
  }, []);

  /** Dismiss the story card and drop into the level (focus must happen inside the gesture for iOS). */
  const enterLevel = useCallback(() => {
    if (!introRef.current) return;
    audio.unlock();
    audio.uiClick();
    setIntro(null);
    gameRef.current.beginLevel();
    focusTyping();
  }, [focusTyping]);

  const pause = useCallback(() => {
    if (screenRef.current !== 'playing') return;
    gameRef.current.setPaused(true);
  }, []);

  const resume = useCallback(() => {
    audio.unlock();
    gameRef.current.setPaused(false);
    focusTyping();
  }, [focusTyping]);

  // attract mode: the game plays itself behind the menus
  useEffect(() => {
    const menu = screen === 'home' || screen === 'leaderboard' || screen === 'world' || screen === 'faq';
    const g = gameRef.current;
    if (menu && (g.demo || !g.running)) { if (!g.demo) g.startDemo(); }
  }, [screen]);

  const quit = useCallback(() => {
    audio.uiClick();
    gameRef.current.stop();
    setPaused(false);
    setScreen('home');
    inputRef.current?.blur();
    audio.setIntensity(0, false);
  }, []);

  // Desktop keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      const scr = screenRef.current;
      const fromHidden = e.target === inputRef.current;
      const inField = !fromHidden && e.target instanceof HTMLInputElement;
      if (scr !== 'playing') {
        if (inField) return;
        if (scr === 'home' && /^[1-4]$/.test(e.key)) chooseDifficulty(DIFFICULTIES[Number(e.key) - 1]);
        else if (scr === 'world' && /^[1-3]$/.test(e.key)) begin(difficultyRef.current, WORLD_ORDER[Number(e.key) - 1]);
        else if ((scr === 'world' || scr === 'faq' || scr === 'leaderboard') && e.key === 'Escape') setScreen('home');
        return;
      }
      if (introRef.current) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterLevel(); }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (game.paused) resume(); else pause();
        return;
      }
      if (game.paused) {
        const k = e.key.toLowerCase();
        if (k === 'c' || k === 'enter') { e.preventDefault(); resume(); }
        else if (k === 'r') { e.preventDefault(); begin(game.difficulty, game.world); }
        else if (k === 'm') { e.preventDefault(); quit(); }
        return;
      }
      if (e.key === 'Backspace') { e.preventDefault(); game.release(); return; }
      if (fromHidden) return; // the input handler owns soft-keyboard text
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e as any).isComposing) return;
      let ch = '';
      if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) ch = e.key;
      else if (e.code?.startsWith('Key')) ch = e.code.slice(3);
      if (ch) { e.preventDefault(); game.type(ch); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [begin, chooseDifficulty, enterLevel, pause, quit, resume]);

  // auto-pause when the tab is hidden or the window loses focus
  useEffect(() => {
    const onHide = () => { if (document.hidden) { pause(); audio.suspend(); } else audio.resume(); };
    const onBlur = () => { if (!touchRef.current) pause(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
    };
  }, [pause]);

  // soft keyboard text
  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const v = el.value;
    const prev = prevValueRef.current;
    let added = '';
    if (v.startsWith(prev)) added = v.slice(prev.length);
    else if (v.length > prev.length) added = v.slice(prev.length - v.length);
    prevValueRef.current = v;
    for (const ch of added) gameRef.current.type(ch);
    if (!composingRef.current && !(e.nativeEvent as InputEvent).isComposing) {
      el.value = '';
      prevValueRef.current = '';
    }
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    const ne = e.nativeEvent as InputEvent;
    if (ne.inputType === 'deleteContentBackward') gameRef.current.release();
  };

  /** The keyboard is opening. Some hosts (in-app browsers, iframes) don't shrink the viewport for it,
   *  so after it has animated in we check, and if nothing moved we reserve space for it ourselves. */
  const handleFocus = () => {
    if (!touchRef.current) return;
    const kb = kbRef.current;
    kb.open = true;
    clearTimeout(kb.timer);
    const check = (tries: number) => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      kb.overlay = vh > kb.baseH * 0.85;
      relayoutRef.current();
      if (tries > 0) kb.timer = setTimeout(() => check(tries - 1), 350);
    };
    kb.timer = setTimeout(() => check(2), 420);
    relayoutRef.current();
  };

  const handleBlur = () => {
    const kb = kbRef.current;
    if (kb.open) {
      kb.open = false; kb.overlay = false;
      clearTimeout(kb.timer);
      setTimeout(() => relayoutRef.current(), 30);
    }
    // On touch devices a closed keyboard means the player can't type, so pause (the normal pause menu).
    if (!touchRef.current) return;
    setTimeout(() => {
      if (screenRef.current === 'playing' && !introRef.current && document.activeElement !== inputRef.current && !gameRef.current.over) {
        gameRef.current.setPaused(true);
      }
    }, 80);
  };

  const onStagePointer = () => {
    audio.unlock();
    if (screenRef.current === 'playing' && !gameRef.current.paused && !introRef.current) focusTyping();
  };

  const submitScore = async () => {
    if (!stats || !name.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try { localStorage.setItem('killtype.name', name.trim()); } catch { /* ignore */ }
    try {
      const token = runTokenRef.current ? await runTokenRef.current : null;
      const res = await submit({
        username: name.trim(), score: stats.score, difficulty: stats.difficulty, wpm: stats.wpm,
        accuracyPct: stats.accuracyPct, runToken: token, kills: stats.kills, level: stats.level,
      });
      setSubmitted(res.entry);
      setBoards({ ...emptyBoards(), ...res.boards });
      setQual(res.qualification);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const ui = (fn: () => void) => () => { audio.unlock(); audio.uiClick(); fn(); };
  const hover = () => audio.uiHover();

  const Board = ({ d, limit = 10 }: { d: Difficulty; limit?: number }) => {
    const rows = boards[d].slice(0, limit);
    const col = DIFFICULTY_CONFIG[d].color;
    return (
      <div className="kt-board" style={{ ['--accent' as any]: col }}>
        {rows.length === 0 ? (
          <div className="kt-board-empty">{boardState === 'loading' ? 'SYNCING…' : boardState === 'error' ? 'LEADERBOARD OFFLINE' : 'NO SCORES YET — BE FIRST'}</div>
        ) : rows.map((r, i) => (
          <div key={r.id} className={`kt-row ${submitted?.id === r.id ? 'is-you' : ''}`}>
            <span className="kt-rank">{String(i + 1).padStart(2, '0')}</span>
            <span className="kt-name">{r.username}</span>
            <span className="kt-meta">{r.wpm} WPM</span>
            <span className="kt-score">{r.score.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  };

  const Tabs = () => (
    <div className="kt-tabs">
      {DIFFICULTIES.map(d => (
        <button key={d} className={`kt-tab ${boardTab === d ? 'is-active' : ''}`} style={{ ['--accent' as any]: DIFFICULTY_CONFIG[d].color }}
          onClick={ui(() => setBoardTab(d))} onMouseEnter={hover}>{d.toUpperCase()}</button>
      ))}
    </div>
  );

  const MuteButton = ({ className = '' }: { className?: string }) => (
    <button className={`kt-icon-btn ${className}`} aria-label={muted ? 'Unmute' : 'Mute'}
      onClick={(e) => { e.stopPropagation(); audio.unlock(); audio.toggleMute(); }}>
      {muted ? (
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" /></svg>
      )}
    </button>
  );

  const game = gameRef.current;

  return (
    <div className={`kt-root ${touch ? 'is-touch' : ''}`}>
      <div ref={stageRef} className="kt-stage" onPointerDown={onStagePointer}>
        <canvas ref={canvasRef} className="kt-canvas" />

        <input
          ref={inputRef}
          className="kt-hidden-input"
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="Type here"
          onInput={handleInput}
          onBeforeInput={handleBeforeInput}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            e.currentTarget.value = '';
            prevValueRef.current = '';
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />

        {screen === 'playing' && (
          <div className="kt-hud-buttons">
            <MuteButton />
            <button className="kt-icon-btn" aria-label="Pause" onClick={(e) => { e.stopPropagation(); audio.uiClick(); pause(); }}>
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            </button>
          </div>
        )}

        {screen === 'playing' && paused && (
          <div className="kt-overlay" onPointerDown={(e) => e.stopPropagation()}>
            <div className="kt-panel kt-pause">
              <div className="kt-kicker">PAUSED</div>
              <h2 className="kt-h2">STAND BY</h2>
              <div className="kt-stats">
                <Stat label="SCORE" value={game.score.toLocaleString()} />
                <Stat label="LEVEL" value={`${game.info.levelInWorld}/10`} />
                <Stat label="WPM" value={String(game.wpm)} />
                <Stat label="ACC" value={`${game.accuracyPct}%`} />
              </div>
              <div className="kt-menu">
                <MenuBtn primary label="Resume" hint={touch ? '' : 'C'} onClick={resume} />
                <MenuBtn label="Restart" hint={touch ? '' : 'R'} onClick={() => begin(game.difficulty, game.world)} />
                <MenuBtn label="Main menu" hint={touch ? '' : 'M'} onClick={quit} />
              </div>
              {touch && (
                <div className="kt-kbgap">
                  <div className="kt-kbgap-label">Keyboard space <span>keeps you above the keyboard</span></div>
                  <div className="kt-seg" role="radiogroup" aria-label="Keyboard space">
                    {KB_GAPS.map(g => (
                      <button key={g.id} role="radio" aria-checked={kbGap === g.id} className={kbGap === g.id ? 'on' : ''}
                        onClick={(e) => { e.stopPropagation(); audio.uiClick(); setKbGap(g.id); try { localStorage.setItem('killtype.kbgap', g.id); } catch { /* ignore */ } }}>{g.label}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="kt-pause-foot">
                <MuteButton />
                {!touch && <span>ESC to resume · BACKSPACE drops a target</span>}
              </div>
            </div>
          </div>
        )}

        {screen === 'playing' && intro && (
          <div className="kt-overlay kt-intro" onPointerDown={(e) => e.stopPropagation()}>
            <IntroCard intro={intro} touch={touch} onGo={enterLevel} />
          </div>
        )}

        {(screen === 'home' || screen === 'leaderboard' || screen === 'world' || screen === 'faq') && (
          <div className="kt-overlay kt-menu-screen" onPointerDown={(e) => { e.stopPropagation(); audio.unlock(); audio.startMusic(); }}>
            <div className="kt-top-right"><MuteButton /></div>
            <div className="kt-home">
              <header className="kt-title-block">
                <div className="kt-kicker">BURNPILES ARCADE · TYPING SURVIVAL</div>
                <h1 className="kt-title" aria-label="KILL TYPE">
                  <svg className="kt-reticle" viewBox="0 0 200 200" aria-hidden="true">
                    <circle cx="100" cy="100" r="78" /><circle cx="100" cy="100" r="54" className="kt-ret-in" />
                    <path d="M100 4v40M100 156v40M4 100h40M156 100h40" />
                  </svg>
                  <span className="kt-t-kill" aria-hidden="true">{'KILL'.split('').map((c, i) => <i key={i} style={{ ['--i' as any]: i }}>{c}</i>)}</span>
                  <span className="kt-t-type" aria-hidden="true">{'TYPE'.split('').map((c, i) => <i key={i} style={{ ['--i' as any]: i }}>{c}</i>)}<b className="kt-caret" /></span>
                </h1>
                <p className="kt-tagline">Every word is a bullet. Type fast or get eaten.</p>
              </header>

              {screen === 'home' && (
                <>
                  <div className="kt-step"><span>1</span> CHOOSE DIFFICULTY</div>
                  <div className="kt-diffs">
                    {DIFFICULTIES.map((d, i) => {
                      const cfg = DIFFICULTY_CONFIG[d];
                      return (
                        <button key={d} className={`kt-diff ${difficulty === d ? 'is-last' : ''}`} style={{ ['--accent' as any]: cfg.color, animationDelay: `${i * 60}ms` }}
                          onClick={() => chooseDifficulty(d)} onMouseEnter={hover}>
                          <span className="kt-diff-top">
                            <span className="kt-diff-name">{d.toUpperCase()}</span>
                            {!touch && <span className="kt-key">{i + 1}</span>}
                          </span>
                          <span className="kt-pips">{[0, 1, 2, 3].map(p => <i key={p} className={p < cfg.threat ? 'on' : ''} />)}</span>
                          <span className="kt-diff-desc">{cfg.description}</span>
                          <span className="kt-diff-cta">×{cfg.scoreMultiplier} SCORE →</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="kt-home-actions">
                    <button className="kt-ghost" onClick={ui(() => { setBoardTab(difficulty); setScreen('leaderboard'); refreshBoards(); })} onMouseEnter={hover}>Leaderboard</button>
                    <span className="kt-tip-wrap" onMouseEnter={() => setScoreTip(true)} onMouseLeave={() => setScoreTip(false)}>
                      <button className="kt-ghost" aria-describedby="kt-score-tip" onClick={ui(() => setScoreTip(v => !v))} onFocus={() => setScoreTip(true)} onBlur={() => setScoreTip(false)}>
                        <span className="kt-info">i</span> How scoring works
                      </button>
                      {scoreTip && (
                        <span id="kt-score-tip" role="tooltip" className="kt-tooltip">
                          <b>Each kill</b> = (100 + 10 per letter) × enemy value × combo × difficulty × weapon bonus.
                          <br />Keep your combo alive: one typo resets it to zero. Bosses, break-frees and level clears add big bonuses.
                          <button className="kt-tip-link" onClick={ui(() => { setScoreTip(false); setScreen('faq'); })}>Full scoring FAQ →</button>
                        </span>
                      )}
                    </span>
                    <button className="kt-ghost" onClick={ui(() => setScreen('faq'))} onMouseEnter={hover}>FAQ</button>
                  </div>
                  <ul className="kt-howto">
                    <li><b>Type a word's first letter</b> to lock on, then finish it to fire.</li>
                    <li><b>Grabbed?</b> Type the break-free word before the timer runs out.</li>
                    <li><b>Kill the boss</b> to clear the level and refill your health.</li>
                  </ul>
                </>
              )}

              {screen === 'world' && (
                <div className="kt-worlds-wrap">
                  <div className="kt-step"><span>2</span> CHOOSE WHERE TO START
                    <em style={{ color: DIFFICULTY_CONFIG[difficulty].color }}>{difficulty.toUpperCase()}</em>
                  </div>
                  <div className="kt-worlds">
                    {WORLD_ORDER.map((wid, i) => {
                      const W = WORLDS[wid];
                      const cast = Array.from(new Set(W.levels.flatMap(l => Object.keys(l.roster) as EnemyKind[]))).slice(0, 7);
                      return (
                        <button key={wid} className={`kt-world ${world === wid ? 'is-last' : ''}`} style={{ ['--accent' as any]: W.color, animationDelay: `${i * 70}ms` }}
                          onClick={() => begin(difficulty, wid)} onMouseEnter={hover}>
                          <span className="kt-diff-top">
                            <span className="kt-world-name">{W.name}</span>
                            {!touch && <span className="kt-key">{i + 1}</span>}
                          </span>
                          <span className="kt-world-tag">{W.tagline}</span>
                          <span className="kt-cast">{cast.map(k => <img key={k} src={thumb(W.skins[k].sprite, 3)} alt={W.skins[k].name} title={W.skins[k].name} />)}</span>
                          <span className="kt-world-levels">{W.levels.slice(0, 4).map(l => l.name).join(' · ')} · …</span>
                          <span className="kt-diff-cta">10 LEVELS · START HERE →</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="kt-world-note">Clear all 10 levels and you roll straight into the next world. Your score never resets until you die.</p>
                  <div className="kt-home-actions"><button className="kt-ghost" onClick={ui(() => setScreen('home'))} onMouseEnter={hover}>← Back</button></div>
                </div>
              )}

              {screen === 'faq' && <Faq onBack={ui(() => setScreen('home'))} />}

              {screen === 'leaderboard' && (
                <div className="kt-panel kt-lb">
                  <div className="kt-lb-head">
                    <div>
                      <div className="kt-kicker">GLOBAL RECORDS</div>
                      <h2 className="kt-h2">LEADERBOARD</h2>
                    </div>
                    <button className="kt-ghost" onClick={ui(() => setScreen('home'))} onMouseEnter={hover}>← Back</button>
                  </div>
                  <Tabs />
                  <Board d={boardTab} />
                </div>
              )}
              <footer className="kt-foot">© 2026 BURNPILES LLC{touch ? ' · Best with a keyboard, built for phones too' : ''}</footer>
            </div>
          </div>
        )}

        {screen === 'over' && stats && (
          <div className="kt-overlay kt-over" onPointerDown={(e) => e.stopPropagation()}>
            <div className="kt-panel kt-over-panel">
              <div className="kt-kicker" style={{ color: '#ff5a6e' }}>SIGNAL LOST · {stats.worldName} · {stats.levelName.toUpperCase()}</div>
              <h2 className="kt-h2 kt-dead">GAME OVER</h2>
              <div className="kt-final">
                <span>FINAL SCORE</span>
                <strong>{stats.score.toLocaleString()}</strong>
              </div>
              <div className="kt-stats six">
                <Stat label="LEVELS" value={String(stats.level - 1)} />
                <Stat label="KILLS" value={String(stats.kills)} />
                <Stat label="MAX COMBO" value={`×${stats.maxCombo}`} />
                <Stat label="WPM" value={String(stats.wpm)} />
                <Stat label="ACCURACY" value={`${stats.accuracyPct}%`} />
                <Stat label="MODE" value={stats.difficulty.toUpperCase()} color={DIFFICULTY_CONFIG[stats.difficulty].color} />
              </div>

              <div className="kt-qual">
                {submitted ? (
                  <div className="kt-qual-ok">RECORDED AT #{submitted.rank} ON {stats.difficulty.toUpperCase()}</div>
                ) : qual?.qualifies || (qualState === 'error' && stats.score > 0) ? (
                  <form className="kt-claim" onSubmit={(e) => { e.preventDefault(); submitScore(); }}>
                    <div className="kt-qual-title">{qual ? `NEW HIGH SCORE · RANK #${qual.rank ?? qual.limit}` : 'CLAIM YOUR SCORE'}</div>
                    <div className="kt-claim-row">
                      <input value={name} maxLength={12} placeholder="YOUR NAME" autoCapitalize="characters" autoComplete="nickname"
                        onChange={(e) => setName(e.target.value.replace(/[^\w .\-]/g, '').slice(0, 12))} />
                      <button type="submit" disabled={submitting || !name.trim()}>{submitting ? 'SAVING…' : 'CLAIM'}</button>
                    </div>
                    {submitError && <div className="kt-err">{submitError}</div>}
                  </form>
                ) : qual ? (
                  <div className="kt-qual-miss">Top {qual.limit} cut line: {qual.lowestScore?.toLocaleString() ?? '—'}</div>
                ) : qualState === 'loading' ? (
                  <div className="kt-qual-miss">Checking leaderboard…</div>
                ) : stats.score > 0 ? (
                  <div className="kt-qual-miss">Leaderboard offline</div>
                ) : null}
              </div>

              <Tabs />
              <Board d={boardTab} limit={5} />

              <div className="kt-menu">
                <MenuBtn primary label={`Play again · ${WORLDS[stats.world].name}`} onClick={() => begin(stats.difficulty, stats.world)} />
                <MenuBtn label="Change difficulty or world" onClick={quit} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="kt-stat">
      <span>{label}</span>
      <strong style={color ? { color } : undefined}>{value}</strong>
    </div>
  );
}

function MenuBtn({ label, hint, onClick, primary }: { label: string; hint?: string; onClick: () => void; primary?: boolean }) {
  return (
    <button className={`kt-btn ${primary ? 'is-primary' : ''}`} onMouseEnter={() => audio.uiHover()}
      onClick={(e) => { e.stopPropagation(); audio.unlock(); audio.uiClick(); onClick(); }}>
      <span>{label}</span>
      {hint ? <kbd>{hint}</kbd> : null}
    </button>
  );
}

function IntroCard({ intro, touch, onGo }: { intro: { info: LevelInfo; summary: LevelSummary | null }; touch: boolean; onGo: () => void }) {
  const { info, summary } = intro;
  const W = info.world;
  const fresh = info.newKinds.slice(0, 4);
  const firstOfWorld = info.levelInWorld === 1;
  return (
    <div className="kt-panel kt-intro-card" style={{ ['--accent' as any]: W.color }}>
      {summary && (
        <div className="kt-clear">
          <div className="kt-kicker" style={{ color: '#3df6ff' }}>LEVEL CLEAR · {summary.name.toUpperCase()}</div>
          <div className="kt-clear-row">
            <span><b>{summary.score.toLocaleString()}</b> points</span>
            <span><b>{summary.kills}</b> kills</span>
            <span><b>{summary.accuracyPct}%</b> accuracy</span>
            {summary.escapes > 0 && <span><b>{summary.escapes}</b> break-free{summary.escapes > 1 ? 's' : ''}</span>}
            <span>bonus <b>+{summary.bonus.toLocaleString()}</b></span>
          </div>
        </div>
      )}
      <div className="kt-kicker">{firstOfWorld && summary ? `NEW WORLD · ${W.name}` : W.name}{info.loop ? ` · LOOP ${info.loop + 1}` : ''}</div>
      <div className="kt-intro-level">LEVEL {info.levelInWorld}<span>/10</span></div>
      <h2 className="kt-h2 kt-intro-name">{info.def.name.toUpperCase()}</h2>
      <div className="kt-progress">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < info.levelInWorld - 1 ? 'done' : i === info.levelInWorld - 1 ? 'now' : ''} />)}</div>
      <p className="kt-story">{info.def.story}</p>
      {fresh.length > 0 && (
        <div className="kt-threats">
          <div className="kt-threats-h">{info.levelInWorld === 1 ? 'YOU WILL MEET' : 'NEW THREATS'}</div>
          {fresh.map(k => (
            <div key={k} className="kt-threat">
              <img src={thumb(W.skins[k].sprite, 3)} alt="" />
              <div><b>{W.skins[k].name}</b><span>{ENEMIES[k].blurb}</span></div>
            </div>
          ))}
        </div>
      )}
      <div className="kt-boss-line">BOSS · <b>{info.def.boss}</b></div>
      <button className="kt-btn is-primary kt-go" autoFocus onClick={(e) => { e.stopPropagation(); onGo(); }}>
        <span>{touch ? 'Tap to fight' : 'Fight'}</span>{!touch && <kbd>ENTER</kbd>}
      </button>
    </div>
  );
}

function Faq({ onBack }: { onBack: () => void }) {
  const worth = useMemo(() => (Object.keys(ENEMIES) as EnemyKind[]).sort((a, b) => ENEMIES[b].value - ENEMIES[a].value), []);
  return (
    <div className="kt-panel kt-faq">
      <div className="kt-lb-head">
        <div>
          <div className="kt-kicker">FIELD MANUAL</div>
          <h2 className="kt-h2">FAQ</h2>
        </div>
        <button className="kt-ghost" onClick={onBack}>← Back</button>
      </div>
      <details open>
        <summary>How is my score calculated?</summary>
        <p>Every kill is worth <code>(100 + 10 × letters) × enemy value × combo × difficulty × weapon</code>.</p>
        <ul>
          <li><b>Letters:</b> longer words are worth more. A 6-letter word starts at 160.</li>
          <li><b>Combo:</b> every correct key adds 1. One typo, a bite or a hit sends it back to 0. This is the biggest lever on your score.</li>
          <li><b>Difficulty:</b> Easy ×1, Normal ×1.2, Hard ×1.5, Extreme ×2.</li>
          <li><b>Weapon:</b> any power-up weapon multiplies kills by ×1.5, and splash kills add every victim's value to the same shot.</li>
        </ul>
      </details>
      <details>
        <summary>What is each enemy worth?</summary>
        <div className="kt-faq-grid">
          {worth.map(k => (
            <div key={k} className="kt-faq-enemy">
              <img src={thumb(WORLDS.mall.skins[k].sprite, 3)} alt="" />
              <div><b>{k === 'karen' ? 'Karen + dog' : k[0].toUpperCase() + k.slice(1)} <em>×{ENEMIES[k].value}</em></b><span>{ENEMIES[k].blurb}</span></div>
            </div>
          ))}
        </div>
        <p className="kt-faq-note">Each world re-skins these: in the Mall the dog is a poodle and the brute is Mall Santa, in the Airport the robot is a security drone, in the Theme Park the horse comes off the carousel.</p>
      </details>
      <details>
        <summary>Power-ups</summary>
        <p>Enemies that glow carry a weapon. Kill them to pick it up.</p>
        <ul>
          {(['grenade', 'rocket', 'machinegun', 'bazooka', 'nuke'] as const).map(id => {
            const w = WEAPONS[id];
            return <li key={id}><b style={{ color: w.color }}>{w.name}</b>: {w.ammo ? `${w.ammo} shot${w.ammo > 1 ? 's' : ''}` : `${w.duration / 1000}s`}, {w.wipeField ? 'kills everything on screen and clears projectiles' : w.explosive ? `explodes and takes up to ${w.maxCollateral >= 99 ? 'every' : w.maxCollateral} nearby enem${w.maxCollateral === 1 ? 'y' : 'ies'} with it, and blasts straight through armour` : `chains into ${w.maxCollateral} nearby enemy`}.</li>;
          })}
        </ul>
      </details>
      <details>
        <summary>Getting grabbed</summary>
        <p>If something reaches you it grabs on and starts biting. The camera pushes in and a <b>break-free word</b> appears with a countdown. Type it in time and you shove the attacker away, score <b>250 × words × difficulty</b> (more with a high combo), and stay locked on so you can finish the kill. Miss the timer and you lose a heart (two for brutes).</p>
        <p>Carts, cars and horses don't grab. They ram you for instant damage, so kill them before they arrive.</p>
      </details>
      <details>
        <summary>Bosses</summary>
        <p>Every level ends with a boss. Shoot off its head, hands and feet in order, then type the execution sentence. It fires eye lasers and missiles, swipes at you and, from level 3, grabs you. A grab needs <b>three</b> fast words to escape. Destroying any limb staggers it and cancels whatever attack it was winding up.</p>
        <p>Boss limbs are worth <code>(100 + 10 × letters) × combo × difficulty</code> each, and the kill adds <code>1,000 × level × difficulty</code> plus a sentence bonus. Killing the boss refills all five hearts.</p>
      </details>
      <details>
        <summary>Levels and worlds</summary>
        <p>Pick a world to start in: the Mall, the Airport or the Theme Park. Each has 10 levels with their own floor, enemies and boss, and each level is longer and faster than the last. Clearing a level pays <code>500 × level × difficulty</code>, or ×1.5 more if your accuracy for that level was 95% or better. After level 10 you move on to the next world, and after all three the loop starts again, faster.</p>
      </details>
      <details>
        <summary>Does the leaderboard check scores?</summary>
        <p>Yes. Each run gets a signed token when it starts, and the server rejects scores that are impossible for the time played. Leaderboards are split by difficulty.</p>
      </details>
    </div>
  );
}
