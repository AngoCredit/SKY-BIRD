import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";


interface ReferralData {
    code:string;
    link:string;
}


export default function ReferralCard(){

    const [data,setData] =
        useState<ReferralData | null>(null);


    const [loading,setLoading] =
        useState(true);



    useEffect(()=>{

        async function loadReferral(){


            const {
                data:userData
            } = await supabase.auth.getUser();



            if(!userData.user){

                setLoading(false);
                return;

            }



            const {
                data,
                error
            } = await supabase

            .from("referral_codes")

            .select(
                "code"
            )

            .eq(
                "user_id",
                userData.user.id
            )

            .single();



            if(error){

                console.error(
                    "Referral load error:",
                    error
                );

                setLoading(false);
                return;

            }



            setData({

                code:data.code,

                link:
                `${window.location.origin}/register?ref=${data.code}`

            });



            setLoading(false);


        }


        loadReferral();


    },[]);




    if(loading)
    return null;



    if(!data)
    return null;



    return (

        <section
        className="
        rounded-2xl
        border
        border-cyan-500/20
        bg-slate-900
        p-6
        "
        >


            <h2
            className="
            text-xl
            font-bold
            text-white
            "
            >
                Programa de Referências
            </h2>



            <div className="mt-4">


                <p className="text-sm text-gray-400">
                    Meu código
                </p>


                <div
                className="
                mt-1
                text-cyan-400
                font-bold
                "
                >
                    {data.code}
                </div>


            </div>



            <div className="mt-4">


                <p className="text-sm text-gray-400">
                    Meu link
                </p>


                <input

                readOnly

                value={data.link}

                className="
                mt-2
                w-full
                rounded-lg
                bg-black/40
                border
                border-white/10
                p-3
                text-sm
                text-white
                "

                />


            </div>




            <button

            onClick={()=>{

                navigator.clipboard.writeText(
                    data.link
                );

            }}

            className="
            mt-4
            rounded-lg
            bg-cyan-500
            px-5
            py-3
            font-bold
            text-black
            "

            >

                COPIAR LINK

            </button>


        </section>

    );


}
