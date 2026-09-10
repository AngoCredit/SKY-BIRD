// ============================================
// SKY-BIRD BOT ENGINE
// VISUAL ONLY - NO FINANCIAL IMPACT
// ============================================


export type BotStatus =
    | "active"
    | "cashed_out"
    | "lost";



export interface SimulatedBotBet {

    id: string;

    nickname: string;

    avatar: string;

    amount: number;

    status: BotStatus;

    autoCashout: number;

    cashoutMultiplier?: number;

    payout?: number;

}



interface SimulatedBotPlayer {
  nickname: string;
  avatar: string;
  flag: string;
}

const BOT_PLAYERS: SimulatedBotPlayer[] = [
  { nickname: "AeroKing", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces", flag: "🇦🇴" },
  { nickname: "BlueBird", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces", flag: "🇧🇷" },
  { nickname: "SkyFox", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop&crop=faces", flag: "🇵🇹" },
  { nickname: "PilotOne", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces", flag: "🇬🇧" },
  { nickname: "Luna", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=faces", flag: "🇫🇷" },
  { nickname: "Nairobi", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&h=100&fit=crop&crop=faces", flag: "🇲🇿" },
  { nickname: "Falcon", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces", flag: "🇪🇸" },
  { nickname: "Phoenix", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=faces", flag: "🇿🇦" },
  { nickname: "StormX", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=faces", flag: "🇺🇸" },
  { nickname: "LuandaFly", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces", flag: "🇦🇴" },
  { nickname: "KwanzaKing", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&crop=faces", flag: "🇦🇴" },
  { nickname: "AviatorPro", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=faces", flag: "🇨🇦" }
];

let currentBots: SimulatedBotBet[] = [];



// ============================================
// RANDOM HELPERS
// ============================================


function random(
    min:number,
    max:number
){

    return Number(
        (
            Math.random() *
            (max - min)
            +
            min
        )
        .toFixed(2)
    );

}



// ============================================
// BOT STRATEGY
// ============================================


function randomCashout(){


    const risk =
        Math.random();



    // Conservador

    if(risk < 0.50){

        return random(
            1.20,
            2.00
        );

    }



    // Normal

    if(risk < 0.85){

        return random(
            2.00,
            5.00
        );

    }



    // Agressivo

    return random(
        5.00,
        15.00
    );


}



// ============================================
// CREATE BOTS WHEN ROUND STARTS
// ============================================


export function createBotRound(){
    currentBots =
    BOT_PLAYERS
    .filter(
        () =>
        Math.random() > 0.15
    )
    .map(
        (player,index)=>(
        {
            id:
            `bot-${Date.now()}-${index}`,

            nickname:
            `${player.flag} ${player.nickname}`,

            avatar:
            player.avatar,

            amount:
            random(
                10,
                200
            ),

            status:
            "active",

            autoCashout:
            randomCashout()
        }
        )
    );

    return currentBots;
}



// ============================================
// GET CURRENT VISUAL BOTS
// ============================================


export function getCurrentBots(){

    return currentBots;

}



// ============================================
// UPDATE DURING FLIGHT
// ============================================


export function updateBots(
    multiplier:number
){


    currentBots =

    currentBots.map(
        bot=>{


            if(

                bot.status === "active"

                &&

                multiplier >= bot.autoCashout

            ){


                return {

                    ...bot,


                    status:
                    "cashed_out",


                    cashoutMultiplier:
                    bot.autoCashout,


                    payout:
                    Number(
                        (
                            bot.amount *
                            bot.autoCashout
                        )
                        .toFixed(2)
                    )

                };

            }



            return bot;


        }

    );



    return currentBots;

}



// ============================================
// WHEN CRASH HAPPENS
// ============================================


export function crashBots(){


    currentBots =

    currentBots.map(
        bot=>{


            if(
                bot.status === "active"
            ){

                return {

                    ...bot,

                    status:
                    "lost"

                };

            }


            return bot;


        }

    );


    return currentBots;

}



// ============================================
// RESET BEFORE NEW ROUND
// ============================================


export function resetBots(){


    currentBots = [];


}
