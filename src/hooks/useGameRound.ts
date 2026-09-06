import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";


export interface GameRound {

    id:string;

    round_number:number;

    status:
    | "WAITING"
    | "RUNNING"
    | "CRASHED"
    | string;


    crash_point:number | null;

    started_at:string | null;

    ended_at:string | null;

    created_at:string;

}



export function useGameRound(){

    const [round,setRound] =
    useState<GameRound | null>(null);


    const [multiplier,setMultiplier] =
    useState<number>(1);



    useEffect(()=>{


        /*
         Buscar rodada atual
        */

        async function loadCurrentRound(){

            const {data,error}=await supabase
            .from("game_rounds")
            .select("*")
            .order(
                "created_at",
                {
                    ascending:false
                }
            )
            .limit(1)
            .single();



            if(!error && data){

                setRound(data);

            }

        }


        loadCurrentRound();



        /*
          Realtime das rodadas
        */

        const channel =
        supabase
        .channel(
            "current-game-round"
        )
        .on(
            "postgres_changes",
            {
                event:"*",
                schema:"public",
                table:"game_rounds"
            },
            (payload)=>{


                const newRound =
                payload.new as GameRound;


                setRound(newRound);



                /*
                Reset multiplicador
                quando nova rodada começa
                */

                if(
                    newRound.status === "WAITING"
                ){

                    setMultiplier(1);

                }


            }
        )
        .subscribe();



        return ()=>{

            supabase.removeChannel(
                channel
            );

        };


    },[]);



    return {

        round,

        multiplier,

        setMultiplier

    };

}
