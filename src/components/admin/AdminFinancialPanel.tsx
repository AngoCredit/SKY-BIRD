import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

interface FinancialStats {
  totalDeposits: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  referralCommissions: number;
}

interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  reference: string;
  created_at: string;
}

export function AdminFinancialPanel() {

  const [stats, setStats] = useState<FinancialStats>({
    totalDeposits: 0,
    totalWithdrawals: 0,
    pendingWithdrawals: 0,
    referralCommissions: 0,
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);


  async function loadFinancialData() {

    try {

      setLoading(true);


      /*
        Buscar transações reais
      */

      const { data, error } = await supabase
        .from("transactions")
        .select(`
          id,
          user_id,
          type,
          amount,
          status,
          reference,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending:false
          }
        )
        .limit(50);



      if(error) throw error;



      const tx = data || [];

      setTransactions(tx);



      /*
        Cálculos financeiros
      */


      const deposits =
        tx
        .filter(
          t =>
          t.type === "deposit"
          &&
          (t.status === "completed" || t.status === "approved")
        )
        .reduce(
          (sum,t)=>
          sum + Number(t.amount),
          0
        );



      const withdrawals =
        tx
        .filter(
          t =>
          t.type === "withdrawal"
          &&
          (t.status === "completed" || t.status === "approved")
        )
        .reduce(
          (sum,t)=>
          sum + Number(t.amount),
          0
        );



      const pending =
        tx
        .filter(
          t =>
          t.type === "withdrawal"
          &&
          t.status === "pending"
        )
        .reduce(
          (sum,t)=>
          sum + Number(t.amount),
          0
        );



      /*
        Comissões reais
      */

      const { data: commissions } =
        await supabase
        .from("referral_commissions")
        .select(
          "commission_amount"
        );



      const referralTotal =
        commissions?.reduce(
          (sum,item)=>
          sum +
          Number(item.commission_amount),
          0
        )
        || 0;



      setStats({

        totalDeposits:
          deposits,

        totalWithdrawals:
          withdrawals,

        pendingWithdrawals:
          pending,

        referralCommissions:
          referralTotal

      });



    }
    catch(error){

      console.error(
        "Financial dashboard error:",
        error
      );

    }
    finally{

      setLoading(false);

    }

  }



  useEffect(()=>{

    loadFinancialData();


    /*
      Atualização realtime
    */

    const channel =
      supabase
      .channel(
        "admin-financial"
      )
      .on(
        "postgres_changes",
        {
          event:"*",
          schema:"public",
          table:"transactions"
        },
        ()=>{
          loadFinancialData();
        }
      )
      .subscribe();



    return ()=>{

      supabase.removeChannel(
        channel
      );

    };


  },[]);



  if(loading){

    return (

      <div className="p-8 text-cyan-400">

        A carregar dados financeiros...

      </div>

    );

  }



  return (

    <div className="space-y-6">


      <h2 className="text-2xl font-bold text-white">
        Relatórios Financeiros
      </h2>



      {/* CARDS */}

      <div className="grid grid-cols-4 gap-4">


        <Card
          title="Total Depositado"
          value={`$${stats.totalDeposits.toFixed(2)}`}
        />


        <Card
          title="Total Retirado"
          value={`$${stats.totalWithdrawals.toFixed(2)}`}
        />


        <Card
          title="Saques Pendentes"
          value={`$${stats.pendingWithdrawals.toFixed(2)}`}
        />


        <Card
          title="Comissões Referência"
          value={`$${stats.referralCommissions.toFixed(2)}`}
        />


      </div>




      {/* TRANSAÇÕES */}


      <div
        className="
        bg-[#101827]
        rounded-xl
        border
        border-slate-800
        overflow-hidden
        "
      >

        <div className="p-5 text-white font-bold">

          Últimas Transações

        </div>


        <table className="w-full text-sm">


          <thead className="text-slate-400">

            <tr>

              <th className="p-3 text-left">
                Tipo
              </th>

              <th className="p-3 text-left">
                Valor
              </th>

              <th className="p-3 text-left">
                Estado
              </th>

              <th className="p-3 text-left">
                Data
              </th>

            </tr>

          </thead>



          <tbody>


          {
            transactions.map(tx=>(

              <tr
                key={tx.id}
                className="
                border-t
                border-slate-800
                text-white
                "
              >

                <td className="p-3">
                  {tx.type}
                </td>


                <td className="p-3 text-cyan-400">

                  ${Number(tx.amount).toFixed(2)}

                </td>


                <td className="p-3">

                  {tx.status}

                </td>


                <td className="p-3 text-slate-400">

                  {new Date(
                    tx.created_at
                  ).toLocaleString()}

                </td>


              </tr>

            ))
          }


          </tbody>


        </table>


      </div>



    </div>

  );

}



function Card(
{
 title,
 value
}:{
 title:string;
 value:string;
}){

return (

<div
className="
bg-[#101827]
border
border-slate-800
rounded-xl
p-5
"
>

<p className="text-slate-400 text-sm">
{title}
</p>


<p className="text-2xl font-bold text-cyan-400 mt-2">
{value}
</p>


</div>

)

}
