import { supabase } from "./supabaseClient";


export interface GameRoundHistory {

    id: string;

    round_number: number;

    crash_point: number;

    status: string;

    started_at: string | null;

    ended_at: string | null;

    created_at: string;

}



/**
 * Buscar últimas rodadas finalizadas
 */
export async function getRecentRounds(
    limit:number = 20
): Promise<GameRoundHistory[]> {


    const { data, error } = await supabase
        .from("game_rounds")
        .select(
            `
            id,
            round_number,
            crash_point,
            status,
            started_at,
            ended_at,
            created_at
            `
        )
        .eq(
            "status",
            "CRASHED"
        )
        .order(
            "created_at",
            {
                ascending:false
            }
        )
        .limit(limit);



    if(error){

        console.error(
            "Erro ao buscar histórico:",
            error
        );

        return [];

    }


    return data ?? [];

}



/**
 * Realtime para novas rodadas finalizadas
 */
export function subscribeRoundHistory(
    callback:(round:GameRoundHistory)=>void
){


    const channel =
    supabase
    .channel(
        "round-history"
    )
    .on(
        "postgres_changes",
        {
            event:"INSERT",
            schema:"public",
            table:"game_rounds"
        },
        (payload)=>{


            const round =
            payload.new as GameRoundHistory;


            if(
                round.status === "CRASHED"
            ){

                callback(round);

            }

        }
    )
    .subscribe();



    return ()=>{

        supabase.removeChannel(
            channel
        );

    };

}



/**
 * Cor visual do multiplicador
 */
export function getMultiplierColor(
    multiplier:number
){


    if(multiplier < 2){

        return "red";

    }


    if(multiplier < 10){

        return "yellow";

    }


    return "green";

}
