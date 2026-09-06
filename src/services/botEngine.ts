export type BotStatus =
  | "active"
  | "cashed_out"
  | "lost";


export interface SimulatedBotBet {
  id:string;
  nickname:string;
  avatar:string;
  amount:number;
  status:BotStatus;
  autoCashout:number;
  cashoutMultiplier?:number;
  payout?:number;
}


const BOT_NAMES = [
  "SkyMaster",
  "Phoenix",
  "FalconX",
  "LuandaFly",
  "KwanzaKing",
  "CrashPilot"
];


let currentBots:SimulatedBotBet[] = [];


function random(min:number,max:number){

 return Number(
  (
   Math.random() *
   (max-min)+min
  ).toFixed(2)
 );

}



function randomCashout(){

 const risk=Math.random();


 if(risk < 0.5)
  return random(1.20,2);


 if(risk < 0.85)
  return random(2,5);


 return random(5,12);

}



export function createBotRound(){

 currentBots =
 BOT_NAMES
 .filter(()=>Math.random()>0.25)
 .map((name,index)=>({

 id:`bot-${Date.now()}-${index}`,

 nickname:name,

 avatar:
 `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,

 amount:
 random(10,200),

 status:"active",

 autoCashout:
 randomCashout()

 }));


 return currentBots;

}



export function getCurrentBots(){

 return currentBots;

}



export function updateBots(multiplier:number){

 currentBots =
 currentBots.map(bot=>{


 if(
 bot.status==="active" &&
 multiplier >= bot.autoCashout
 ){

 return {

 ...bot,

 status:"cashed_out",

 cashoutMultiplier:
 bot.autoCashout,

 payout:
 Number(
 (
 bot.amount *
 bot.autoCashout
 ).toFixed(2)
 )

 };

 }


 return bot;

 });


 return currentBots;

}



export function crashBots(){

 currentBots =
 currentBots.map(bot=>{


 if(bot.status==="active"){

 return {
  ...bot,
  status:"lost"
 };

 }


 return bot;

 });


}
