import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/jetbrains-mono/700.css';
import './game.css';
import { audio } from './audio';
import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from './config';
import { Game, type RunStats } from './engine';
import { Renderer } from './render';
import {
  emptyBoards, fetchBoards, qualify, startRun, submit,
  type Boards, type LeaderboardEntry, type Qualification,
} from './leaderboard';

type Screen = 'home' | 'leaderboard' | 'playing' | 'over';

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 1100));

function useMuted() {
  return useSyncExternalStore(cb => audio.subscribe(cb), () => audio.muted, () => false);
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
  const [needsTap, setNeedsTap] = useState(false);
  const [touch, setTouch] = useState(isTouchDevice);
  const [difficulty, setDifficulty] = useState<Difficulty>('hard');
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

  const screenRef = useRef(screen);
  screenRef.current = screen;
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
      const h = Math.round(vv?.height ?? window.innerHeight);
      const top = Math.round(vv?.offsetTop ?? 0);
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
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      gameRef.current.update(dt);
      rendererRef.current?.draw(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- engine events ----------
  useEffect(() => {
    const game = gameRef.current;
    game.onEvent = (e) => {
      if (e.type === 'pause') setPaused(e.paused);
      if (e.type === 'gameover') {
        setStats(e.stats);
        audio.setIntensity(0, false);
        setScreen('over');
        setPaused(false);
        setNeedsTap(false);
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

  const begin = useCallback((d: Difficulty) => {
    audio.unlock();
    audio.uiClick();
    audio.startMusic();
    setDifficulty(d);
    setStats(null);
    setPaused(false);
    setNeedsTap(false);
    setScreen('playing');
    gameRef.current.start(d);
    runTokenRef.current = startRun(d);
    focusTyping();
  }, [focusTyping]);

  const pause = useCallback(() => {
    if (screenRef.current !== 'playing') return;
    gameRef.current.setPaused(true);
  }, []);

  const resume = useCallback(() => {
    audio.unlock();
    gameRef.current.setPaused(false);
    setNeedsTap(false);
    focusTyping();
  }, [focusTyping]);

  const quit = useCallback(() => {
    audio.uiClick();
    gameRef.current.stop();
    setPaused(false);
    setNeedsTap(false);
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
        if (scr === 'home' && /^[1-4]$/.test(e.key)) begin(DIFFICULTIES[Number(e.key) - 1]);
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
        else if (k === 'r') { e.preventDefault(); begin(game.difficulty); }
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
  }, [begin, pause, quit, resume]);

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

  const handleBlur = () => {
    // On touch devices a closed keyboard means the player can't type: pause and ask for a tap.
    if (!touchRef.current) return;
    setTimeout(() => {
      if (screenRef.current === 'playing' && document.activeElement !== inputRef.current && !gameRef.current.over) {
        gameRef.current.setPaused(true);
        setNeedsTap(true);
      }
    }, 80);
  };

  const onStagePointer = () => {
    audio.unlock();
    if (screenRef.current === 'playing' && !gameRef.current.paused) focusTyping();
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

        {screen === 'playing' && paused && needsTap && (
          <div className="kt-overlay kt-tap" onPointerDown={(e) => { e.stopPropagation(); }} onClick={resume}>
            <div className="kt-tap-inner">
              <div className="kt-kicker">KEYBOARD CLOSED</div>
              <div className="kt-tap-title">TAP TO KEEP TYPING</div>
              <div className="kt-tap-sub">The game paused so nothing sneaks up on you.</div>
              <button className="kt-text-btn" onClick={(e) => { e.stopPropagation(); setNeedsTap(false); }}>Open pause menu</button>
            </div>
          </div>
        )}

        {screen === 'playing' && paused && !needsTap && (
          <div className="kt-overlay" onPointerDown={(e) => e.stopPropagation()}>
            <div className="kt-panel kt-pause">
              <div className="kt-kicker">PAUSED</div>
              <h2 className="kt-h2">STAND BY</h2>
              <div className="kt-stats">
                <Stat label="SCORE" value={game.score.toLocaleString()} />
                <Stat label="CHAPTER" value={String(game.level)} />
                <Stat label="WPM" value={String(game.wpm)} />
                <Stat label="ACC" value={`${game.accuracyPct}%`} />
              </div>
              <div className="kt-menu">
                <MenuBtn primary label="Resume" hint={touch ? '' : 'C'} onClick={resume} />
                <MenuBtn label="Restart" hint={touch ? '' : 'R'} onClick={() => begin(game.difficulty)} />
                <MenuBtn label="Main menu" hint={touch ? '' : 'M'} onClick={quit} />
              </div>
              <div className="kt-pause-foot">
                <MuteButton />
                {!touch && <span>ESC to resume · BACKSPACE drops a target</span>}
              </div>
            </div>
          </div>
        )}

        {(screen === 'home' || screen === 'leaderboard') && (
          <div className="kt-overlay kt-menu-screen" onPointerDown={(e) => { e.stopPropagation(); audio.unlock(); audio.startMusic(); }}>
            <div className="kt-top-right"><MuteButton /></div>
            <div className="kt-home">
              <header className="kt-title-block">
                <div className="kt-kicker">BURNPILES ARCADE · TYPING SURVIVAL</div>
                <h1 className="kt-title" data-text="KILL TYPE">KILL TYPE</h1>
                <p className="kt-tagline">Every word is a bullet. Type fast or get eaten.</p>
              </header>

              {screen === 'home' ? (
                <>
                  <div className="kt-diffs">
                    {DIFFICULTIES.map((d, i) => {
                      const cfg = DIFFICULTY_CONFIG[d];
                      return (
                        <button key={d} className={`kt-diff ${difficulty === d ? 'is-last' : ''}`} style={{ ['--accent' as any]: cfg.color, animationDelay: `${i * 60}ms` }}
                          onClick={() => begin(d)} onMouseEnter={hover}>
                          <span className="kt-diff-top">
                            <span className="kt-diff-name">{d.toUpperCase()}</span>
                            {!touch && <span className="kt-key">{i + 1}</span>}
                          </span>
                          <span className="kt-pips">{[0, 1, 2, 3].map(p => <i key={p} className={p < cfg.threat ? 'on' : ''} />)}</span>
                          <span className="kt-diff-desc">{cfg.description}</span>
                          <span className="kt-diff-cta">{touch ? 'TAP TO DEPLOY' : 'DEPLOY'} →</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="kt-home-actions">
                    <button className="kt-ghost" onClick={ui(() => { setBoardTab(difficulty); setScreen('leaderboard'); refreshBoards(); })} onMouseEnter={hover}>Leaderboard</button>
                  </div>
                  <ul className="kt-howto">
                    <li><b>Type a word's first letter</b> to lock on.</li>
                    <li><b>Finish the word</b> to fire. Mistakes break your combo.</li>
                    <li><b>Glowing zombies</b> carry weapons. Kill them to take it.</li>
                  </ul>
                </>
              ) : (
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
              <div className="kt-kicker" style={{ color: '#ff5a6e' }}>SIGNAL LOST</div>
              <h2 className="kt-h2 kt-dead">GAME OVER</h2>
              <div className="kt-final">
                <span>FINAL SCORE</span>
                <strong>{stats.score.toLocaleString()}</strong>
              </div>
              <div className="kt-stats six">
                <Stat label="CHAPTER" value={String(stats.level)} />
                <Stat label="KILLS" value={String(stats.kills)} />
                <Stat label="MAX COMBO" value={`×${stats.maxCombo}`} />
                <Stat label="WPM" value={String(stats.wpm)} />
                <Stat label="ACCURACY" value={`${stats.accuracyPct}%`} />
                <Stat label="MODE" value={stats.difficulty.toUpperCase()} color={DIFFICULTY_CONFIG[stats.difficulty].color} />
              </div>

              <div className="kt-qual">
                {submitted ? (
                  <div className="kt-qual-ok">RECORDED AT #{submitted.rank} ON {stats.difficulty.toUpperCase()}</div>
                ) : qual?.qualifies ? (
                  <form className="kt-claim" onSubmit={(e) => { e.preventDefault(); submitScore(); }}>
                    <div className="kt-qual-title">NEW HIGH SCORE · RANK #{qual.rank ?? qual.limit}</div>
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
                <MenuBtn primary label={`Play again · ${stats.difficulty.toUpperCase()}`} onClick={() => begin(stats.difficulty)} />
                <MenuBtn label="Change difficulty" onClick={quit} />
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
