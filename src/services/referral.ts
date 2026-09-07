import { supabase } from "./supabase";


export async function getReferralData(userId:string){

    const {data,error}=await supabase
        .from("referral_codes")
        .select(
            `
            code,
            active
            `
        )
        .eq(
            "user_id",
            userId
        )
        .single();


    if(error)
        throw error;


    return {

        code:data.code,

        link:
        `${window.location.origin}/register?ref=${data.code}`

    };

}
