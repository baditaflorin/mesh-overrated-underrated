import { useEffect, useMemo, useState } from "react";
import {
  createClockSync,
  useDeadline,
  useDraft,
  useEventLog,
  useFairRng,
  useFlashOnChange,
  useNamedPeer,
  usePhase,
  useRoster,
  useRotatingTurn,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type Topic = { id: string; peerId: string; text: string; ts: number; slotId: number };

const SLOT_MS = 30_000;
const BINS = [
  { lo: -100, hi: -60, label: "overrated" },
  { lo: -60, hi: -20, label: "kinda over" },
  { lo: -20, hi: 20, label: "correct" },
  { lo: 20, hi: 60, label: "kinda under" },
  { lo: 60, hi: 100, label: "underrated" },
];

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="our-screen">
        <h1>overrated / underrated</h1>
        <p className="our-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, nameOf, myName } = useNamedPeer(config, room);
  const clock = useMemo(() => createClockSync(room.provider), [room]);
  useEffect(() => () => clock.destroy(), [clock]);

  const roster = useRoster(room);
  useFairRng(room, "our-salts", { peerIds: roster.present, minContributors: 1 });
  const phase = usePhase<"lobby" | "voting" | "done">(room, "phase", "lobby");
  const turn = useRotatingTurn(room, clock, { slotMs: SLOT_MS, order: "shuffle" });
  const topics = useEventLog<Topic>(room, "topics");
  const draft = useDraft<string>(`${config.storagePrefix}:topic-draft`, "");

  const [, rerender] = useState(0);
  useEffect(() => {
    const m = room.doc.getMap<number>("ratings");
    const cb = () => rerender((n) => n + 1);
    m.observe(cb);
    return () => m.unobserve(cb);
  }, [room]);
  const ratings = room.doc.getMap<number>("ratings");

  const deadline = useDeadline(turn.slotId * SLOT_MS + SLOT_MS, { clock, tickMs: 500 });
  const isVoting = phase.phase === "voting";
  const currentTopic = isVoting
    ? topics.events.filter((t) => t.slotId === turn.slotId).slice(-1)[0]
    : undefined;
  const droppedThisSlot = topics.events.some(
    (t) => t.slotId === turn.slotId && t.peerId === room.peerId,
  );
  const myRating = currentTopic ? (ratings.get(`${currentTopic.id}|${room.peerId}`) ?? 0) : 0;

  const peerRatings: number[] = [];
  if (currentTopic) {
    ratings.forEach((v, k) => {
      if (k.startsWith(`${currentTopic.id}|`) && typeof v === "number") peerRatings.push(v);
    });
  }
  const avg =
    peerRatings.length > 0 ? peerRatings.reduce((s, v) => s + v, 0) / peerRatings.length : 0;
  const flash = useFlashOnChange(Math.round(avg));

  const start = () => {
    room.doc.transact(() => {
      room.doc.getMap<number>("state").set("baselineSlot", turn.slotId);
      phase.transition("voting", { from: "lobby" });
    });
  };

  const drop = () => {
    const text = draft.value.trim();
    if (!text || droppedThisSlot || !turn.isMyTurn) return;
    draft.commit((v) => {
      topics.push({
        id: Math.random().toString(36).slice(2, 12),
        peerId: room.peerId,
        text: v.trim(),
        ts: Date.now(),
        slotId: turn.slotId,
      });
    });
  };

  const setRating = (n: number) => {
    if (!currentTopic) return;
    ratings.set(`${currentTopic.id}|${room.peerId}`, n);
  };

  const dropperName = turn.currentPeerId
    ? (nameOf(turn.currentPeerId) ?? `peer-${turn.currentPeerId.slice(0, 6)}`)
    : "—";
  const nextName =
    turn.nextPeerId && turn.nextPeerId !== turn.currentPeerId
      ? (nameOf(turn.nextPeerId) ?? `peer-${turn.nextPeerId.slice(0, 6)}`)
      : null;
  const gap = Math.round(myRating - avg);
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  return (
    <div className="our-screen">
      <header className="our-header">
        <h1>overrated / underrated</h1>
        <input
          className="our-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          aria-label="your name"
          maxLength={24}
        />
        <p className="our-status">
          {room.peerCount + 1} peer{room.peerCount === 0 ? "" : "s"} · you: {myName}
        </p>
      </header>

      {phase.phase === "lobby" && (
        <>
          <p className="our-help">
            Take turns naming a thing — a movie, a tool, a hot take. Each peer gets a 30-second turn
            to drop one. Everyone else slides <strong>overrated ↔ correct ↔ underrated</strong>, and
            the room average shows how far your take is from the crowd. Try it with two browser
            tabs.
          </p>
          <button type="button" className="our-start" aria-label="start" onClick={start}>
            start
          </button>
        </>
      )}

      {isVoting && (
        <div className={`our-turn ${turn.isMyTurn ? "is-me" : ""}`}>
          <span className="our-turn-info">
            <span className="our-current-name">dropping: {dropperName}</span>
            {turn.isMyTurn && <span className="our-current-you"> (you)</span>}
            {nextName && <span className="our-current-next"> · next: {nextName}</span>}
          </span>
          <span className="our-countdown">{deadline.fmt}</span>
        </div>
      )}

      {isVoting && turn.isMyTurn && !droppedThisSlot && (
        <div className="our-drop-row">
          <textarea
            value={draft.value}
            onChange={(e) => draft.setValue(e.target.value)}
            placeholder="your topic"
            maxLength={120}
            aria-label="your topic"
          />
          <button type="button" className="our-drop" aria-label="drop topic" onClick={drop}>
            drop topic
          </button>
        </div>
      )}

      {isVoting && currentTopic && (
        <>
          <div className={`our-current ${flash ? "is-flash" : ""}`}>{currentTopic.text}</div>
          <p className="our-prompt">drag to place your take</p>
          <input
            className="our-slider"
            type="range"
            min="-100"
            max="100"
            value={myRating}
            aria-label="your rating"
            onChange={(e) => setRating(parseInt(e.target.value, 10))}
          />
          <div className="our-scale">
            <span>overrated</span>
            <span>correct</span>
            <span>underrated</span>
          </div>
          <div className="our-histogram" role="group" aria-label="distribution">
            {BINS.map((b, i) => {
              const count = peerRatings.filter((r) =>
                i === BINS.length - 1 ? r >= b.lo && r <= b.hi : r >= b.lo && r < b.hi,
              ).length;
              const max = Math.max(1, peerRatings.length);
              return (
                <div key={i} className="our-bin" data-bin={i} data-count={count}>
                  <div className="our-bar" style={{ opacity: 0.25 + 0.75 * (count / max) }} />
                  <span className="our-bin-count">{count}</span>
                  <span className="our-bin-label">{b.label}</span>
                </div>
              );
            })}
          </div>
          <div className="our-gap" data-gap={gap}>
            you: {sign(Math.round(myRating))} · room: {sign(Math.round(avg))} (Δ{sign(gap)}) ·{" "}
            {peerRatings.length} vote{peerRatings.length === 1 ? "" : "s"}
          </div>
        </>
      )}

      {isVoting && !currentTopic && !turn.isMyTurn && (
        <p className="our-waiting">waiting for {dropperName} to drop a topic…</p>
      )}
    </div>
  );
}
