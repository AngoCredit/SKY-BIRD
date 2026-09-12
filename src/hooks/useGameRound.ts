/**
 * SKY-BIRD GAME ROUND HOOK
 *
 * Autoritative state comes from PostgreSQL/Supabase.
 *
 * Bot Engine is VISUAL ONLY.
 * It never creates financial records.
 */


import {
    useEffect,
    useState
} from "react";

import {
    getAuthoritativeRound,
    subscribeToAuthoritativeRound,
    getRoundTimeline,
    visualMultiplier,
    serverNowMs,
    type AuthoritativeRound,
    type RoundTimeline
} from "../services/authoritativeGame";

import {
    createBotRound,
    updateBots,
    crashBots,
    resetBots
} from "../services/botEngine";

export function useGameRound(){
    const [round, setRound] = useState<AuthoritativeRound | null>(null);
    const [timeline, setTimeline] = useState<RoundTimeline | null>(null);
    const [multiplier, setMultiplier] = useState<number>(1);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        async function init() {
            try {
                const current = await getAuthoritativeRound();
                if (current) {
                    setRound(current);
                    handleRoundChange(current);
                }

                unsubscribe = subscribeToAuthoritativeRound((newRound) => {
                    setRound(newRound);
                    handleRoundChange(newRound);
                }, 500);
            } catch (error) {
                console.error("[SKY-BIRD] round init error", error);
            }
        }

        init();

        return () => {
            if (unsubscribe) unsubscribe();
            resetBots();
        };
    }, []);

    // Timeline and visual multiplier synchronization loop
    useEffect(() => {
        if (!round) return;

        let frameId = 0;
        const syncLoop = () => {
            const now = serverNowMs();
            const currentTimeline = getRoundTimeline(round, now);
            setTimeline(currentTimeline);

            if (round.status === "RUNNING") {
                const currentMult = visualMultiplier(round, now);
                setMultiplier(currentMult);
                updateBots(currentMult);
            } else if (round.status === "CRASHED" || round.status === "SETTLED") {
                setMultiplier(round.crashPoint ?? 1);
            } else {
                setMultiplier(1);
            }

            frameId = requestAnimationFrame(syncLoop);
        };

        frameId = requestAnimationFrame(syncLoop);
        return () => cancelAnimationFrame(frameId);
    }, [round]);

    function handleRoundChange(current: AuthoritativeRound) {
        switch (current.status) {
            case "WAITING":
            case "COUNTDOWN":
                setMultiplier(1);
                resetBots();
                createBotRound();
                break;
            case "RUNNING":
                break;
            case "CRASHED":
            case "SETTLED":
                crashBots();
                break;
        }
    }

    return {
        round,
        timeline,
        multiplier,
        isRunning: round?.status === "RUNNING",
        isWaiting: round?.status === "WAITING" || round?.status === "COUNTDOWN",
        isCrashed: round?.status === "CRASHED",
    };
}
