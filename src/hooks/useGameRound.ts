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
    useState,
    useRef
} from "react";


import {
    getAuthoritativeRound,
    subscribeToAuthoritativeRound,
    visualMultiplier,
    type AuthoritativeRound
}
from "../services/authoritativeGame";


import {
    createBotRound,
    updateBots,
    crashBots,
    resetBots
}
from "../services/botEngine";



export function useGameRound(){


    const [round,setRound] =
    useState<AuthoritativeRound | null>(null);



    const [multiplier,setMultiplier] =
    useState<number>(1);



    const multiplierTimer =
    useRef<number | null>(null);



    /**
     * Load initial round
     */

    useEffect(()=>{


        let unsubscribe:
        (()=>void) | undefined;



        async function init(){


            try {


                const current =
                await getAuthoritativeRound();



                if(current){

                    setRound(current);

                    handleRoundChange(current);

                }



                unsubscribe =
                subscribeToAuthoritativeRound(
                    (newRound)=>{

                        setRound(newRound);

                        handleRoundChange(newRound);

                    },
                    500
                );


            }

            catch(error){

                console.error(
                    "[SKY-BIRD] round init error",
                    error
                );

            }


        }



        init();



        return ()=>{


            if(unsubscribe){

                unsubscribe();

            }


            stopMultiplierLoop();


            resetBots();


        };


    },[]);



    /**
     * Handle round states
     */


    function handleRoundChange(
        current:AuthoritativeRound
    ){


        switch(current.status){


            case "WAITING":

            case "COUNTDOWN":


                stopMultiplierLoop();


                setMultiplier(1);


                resetBots();


                createBotRound();


            break;



            case "RUNNING":


                startMultiplierLoop(
                    current
                );


            break;



            case "CRASHED":

            case "SETTLED":


                stopMultiplierLoop();


                crashBots();


            break;


        }


    }




    /**
     * Visual multiplier loop
     *
     * Financial authority remains PostgreSQL
     */


    function startMultiplierLoop(
        current:AuthoritativeRound
    ){


        stopMultiplierLoop();



        multiplierTimer.current =
        window.setInterval(()=>{


            const value =
            visualMultiplier(
                current,
                Date.now()
            );



            setMultiplier(value);



            // Visual bots only

            updateBots(value);



        },100);


    }



    function stopMultiplierLoop(){


        if(
            multiplierTimer.current
        ){

            clearInterval(
                multiplierTimer.current
            );


            multiplierTimer.current=null;

        }


    }



    return {


        round,


        multiplier,


        isRunning:
        round?.status === "RUNNING",


        isWaiting:
        round?.status === "WAITING"
        ||
        round?.status === "COUNTDOWN",


        isCrashed:
        round?.status === "CRASHED",


    };


}
