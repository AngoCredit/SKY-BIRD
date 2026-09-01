import { useState, useEffect } from 'react';

/**
 * Internationalization (i18n) Engine for SKYBIRD
 * Supported languages:
 * - pt: 🇵🇹 Português (Portugal)
 * - en: 🇬🇧 English
 * - fr: 🇫🇷 Français
 */

export type Language = 'pt' | 'en' | 'fr';

export interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
  country: string;
}

export const LANGUAGES: LanguageOption[] = [
  {
    code: 'pt',
    name: 'Português',
    nativeName: 'Português (Portugal)',
    flag: '🇵🇹',
    country: 'Portugal'
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    country: 'United Kingdom'
  },
  {
    code: 'fr',
    name: 'Français',
    nativeName: 'Français',
    flag: '🇫🇷',
    country: 'France'
  }
];

type TranslationDictionary = {
  [key: string]: {
    pt: string;
    en: string;
    fr: string;
  };
};

export const translations: TranslationDictionary = {
  // --- Navigation & Brand ---
  'nav.home': { pt: 'Início', en: 'Home', fr: 'Accueil' },
  'nav.play': { pt: 'Jogar', en: 'Play', fr: 'Jouer' },
  'nav.wallet': { pt: 'Carteira', en: 'Wallet', fr: 'Portefeuille' },
  'nav.support': { pt: 'Suporte', en: 'Support', fr: 'Support' },
  'nav.admin': { pt: 'Painel Admin', en: 'Admin Panel', fr: 'Panneau Admin' },
  'nav.login': { pt: 'Entrar', en: 'Log In', fr: 'Connexion' },
  'nav.register': { pt: 'Criar Conta', en: 'Sign Up', fr: "S'inscrire" },
  'nav.logout': { pt: 'Sair', en: 'Log Out', fr: 'Déconnexion' },
  'nav.deposit': { pt: 'Depositar', en: 'Deposit', fr: 'Déposer' },
  'nav.withdraw': { pt: 'Sacar', en: 'Withdraw', fr: 'Retirer' },
  'nav.howItWorks': { pt: 'Como Funciona', en: 'How It Works', fr: 'Comment ça marche' },
  'nav.simulator': { pt: 'Simulador', en: 'Simulator', fr: 'Simulateur' },
  'nav.security': { pt: 'Segurança', en: 'Security', fr: 'Sécurité' },
  'nav.community': { pt: 'Comunidade', en: 'Community', fr: 'Communauté' },
  'nav.testimonials': { pt: 'Depoimentos', en: 'Testimonials', fr: 'Témoignages' },
  'nav.faq': { pt: 'Perguntas Frequentes', en: 'FAQ', fr: 'FAQ' },
  'nav.demoBalance': { pt: 'Saldo de Demonstração', en: 'Demo Balance', fr: 'Solde Démo' },
  'nav.realBalance': { pt: 'Saldo USD', en: 'USD Balance', fr: 'Solde USD' },
  'nav.selectLanguage': { pt: 'Idioma', en: 'Language', fr: 'Langue' },

  // --- Landing Page ---
  'landing.badge': { pt: 'PLATAFORMA OFICIAL CRASH 3D', en: 'OFFICIAL 3D CRASH PLATFORM', fr: 'PLATEFORME OFFICIELLE CRASH 3D' },
  'landing.heroTitle1': { pt: 'O JOGO DO PÁSSARO', en: 'THE BIRD MULTIPLIER GAME', fr: "LE JEU DU MULTIPLICATEUR D'OISEAU" },
  'landing.heroTitle2': { pt: 'QUE MULTIPLICA ATÉ 100x', en: 'THAT MULTIPLIES UP TO 100x', fr: "QUI MULTIPLIE JUSQU'À 100x" },
  'landing.heroSubtitle': {
    pt: 'Decole no cockpit 3D com gráficos ultrarrealistas, física de voo em tempo real, saques rápidos em 15-30 minutos via Airtm e sistema 100% Provably Fair auditável.',
    en: 'Take off in the 3D cockpit with ultra-realistic graphics, real-time flight physics, fast 15-30 minute withdrawals via Airtm, and 100% auditable Provably Fair system.',
    fr: 'Décollez dans le cockpit 3D avec des graphismes ultra-réalistes, une physique de vol en temps réel, des retraits rapides en 15-30 minutes via Airtm et un système Provably Fair 100% auditable.'
  },
  'landing.ctaPlay': { pt: 'JOGAR AGORA', en: 'PLAY NOW', fr: 'JOUER MAINTENANT' },
  'landing.ctaHowToPlay': { pt: 'Como Funciona', en: 'How It Works', fr: 'Comment ça marche' },
  'landing.stat1Label': { pt: 'Multiplicador Máximo', en: 'Max Multiplier', fr: 'Multiplicateur Max' },
  'landing.stat1Value': { pt: 'Até 100.00x', en: 'Up to 100.00x', fr: "Jusqu'à 100.00x" },
  'landing.stat2Label': { pt: 'Velocidade de Saque', en: 'Withdrawal Speed', fr: 'Vitesse de Retrait' },
  'landing.stat2Value': { pt: '15 a 30 min', en: '15 to 30 min', fr: '15 à 30 min' },
  'landing.stat3Label': { pt: 'Integridade dos Resultados', en: 'Result Integrity', fr: 'Intégrité des Résultats' },
  'landing.stat3Value': { pt: '100% Justo (Fair)', en: '100% Provably Fair', fr: '100% Équitable (Fair)' },
  'landing.stat4Label': { pt: 'Moeda de Operação', en: 'Operating Currency', fr: 'Devise d’Opération' },
  'landing.stat4Value': { pt: 'Dólar (USD)', en: 'US Dollar (USD)', fr: 'Dollar US (USD)' },

  // Airtm Banner
  'landing.airtmBannerTitle': { pt: 'Airtm: Depósitos e Saques Oficiais em Dólares (USD)', en: 'Airtm: Official Deposits and Withdrawals in Dollars (USD)', fr: 'Airtm : Dépôts et Retraits Officiels en Dollars (USD)' },
  'landing.airtmBannerDesc': {
    pt: 'Transações seguras e ágeis. Depósitos instantâneos e saques creditados entre 15 a 30 minutos em sua carteira digital oficial.',
    en: 'Secure and agile transactions. Instant deposits and withdrawals credited within 15 to 30 minutes to your official digital wallet.',
    fr: 'Transactions sécurisées et rapides. Dépôts instantanés et retraits crédités en 15 à 30 minutes sur votre portefeuille numérique officiel.'
  },
  'landing.airtmRegisterLink': { pt: 'Criar Conta Airtm Gratuitamente', en: 'Create Free Airtm Account', fr: 'Créer un Compte Airtm Gratuit' },

  // How It Works Section
  'how.title': { pt: 'COMO FUNCIONA O SKYBIRD', en: 'HOW SKYBIRD WORKS', fr: 'COMMENT FONCTIONNE SKYBIRD' },
  'how.subtitle': { pt: 'Regras simples, estratégia em tempo real e controle total dos seus ganhos', en: 'Simple rules, real-time strategy, and total control over your winnings', fr: 'Règles simples, stratégie en temps réel et contrôle total de vos gains' },
  'how.step1Title': { pt: '1. Defina sua Aposta', en: '1. Place Your Bet', fr: '1. Placez Votre Mise' },
  'how.step1Desc': { pt: 'Escolha o valor da aposta em USD antes da decolagem ou ative o modo de aposta automática.', en: 'Choose your bet amount in USD before takeoff or enable auto-betting mode.', fr: 'Choisissez le montant de votre mise en USD avant le décollage ou activez le mode de mise automatique.' },
  'how.step2Title': { pt: '2. Acompanhe a Decolagem', en: '2. Watch the Takeoff', fr: '2. Suivez le Décollage' },
  'how.step2Desc': { pt: 'O pássaro alça voo e o multiplicador cresce de 1.00x até atingir o ápice da altitude.', en: 'The bird takes off and the multiplier climbs from 1.00x upwards.', fr: "L'oiseau s'envole et le multiplicateur augmente à partir de 1.00x." },
  'how.step3Title': { pt: '3. Saque no Momento Certo', en: '3. Cash Out on Time', fr: '3. Encaissez au Bon Moment' },
  'how.step3Desc': { pt: 'Clique em SACAR antes do pássaro cair para garantir seu lucro multiplicado instantaneamente.', en: 'Click CASH OUT before the bird crashes to secure your multiplied profit instantly.', fr: "Cliquez sur ENCAISSER avant que l'oiseau ne tombe pour garantir vos gains." },

  // Simulator Section
  'sim.title': { pt: 'SIMULADOR DE LUCRO INTERATIVO', en: 'INTERACTIVE PROFIT SIMULATOR', fr: 'SIMULATEUR DE GAINS INTERACTIF' },
  'sim.subtitle': { pt: 'Descubra quanto você receberia dependendo da sua aposta e do multiplicador alcançado', en: 'See how much you would win based on your bet amount and the multiplier achieved', fr: 'Découvrez combien vous gagneriez selon votre mise et le multiplicateur atteint' },
  'sim.betAmount': { pt: 'Valor da Aposta (USD):', en: 'Bet Amount (USD):', fr: 'Montant de la Mise (USD) :' },
  'sim.multiplierTarget': { pt: 'Multiplicador Alvo:', en: 'Target Multiplier:', fr: 'Multiplicateur Cible :' },
  'sim.totalPayout': { pt: 'Retorno Total Bruto:', en: 'Total Gross Payout:', fr: 'Retour Brut Total :' },
  'sim.netProfit': { pt: 'Lucro Líquido Real:', en: 'Net Real Profit:', fr: 'Bénéfice Net Réel :' },
  'sim.simulateCTA': { pt: 'EXPERIMENTAR NO JOGO REAL', en: 'TRY IN REAL GAME', fr: 'ESSAYER DANS LE VRAI JEU' },

  // African Community & Real Gaming Section
  'community.title': { pt: 'COMUNIDADE AFRICANA E GLOBAL', en: 'AFRICAN & GLOBAL COMMUNITY', fr: 'COMMUNAUTÉ AFRICAINE ET GLOBALE' },
  'community.subtitle': { pt: 'Milhares de jogadores conectados, compartilhando vitórias e estratégias em tempo real', en: 'Thousands of players connected, sharing wins and strategies in real time', fr: 'Des milliers de joueurs connectés, partageant victoires et stratégies en temps réel' },
  'community.panoramicTitle': { pt: 'Desempenho Otimizado para Desktop e Mobile', en: 'Optimized Performance for Desktop and Mobile', fr: 'Performance Optimisée pour Desktop et Mobile' },
  'community.panoramicDesc': { pt: 'Cockpit fluido a 60 FPS com baixa latência, adaptado para qualquer conexão de internet.', en: 'Smooth 60 FPS cockpit with low latency, adapted for any internet connection.', fr: 'Cockpit fluide à 60 FPS avec faible latence, adapté à toute connexion Internet.' },
  'community.groupTitle': { pt: 'Celebrações Coletivas e Prêmios Instantâneos', en: 'Group Celebrations and Instant Winnings', fr: 'Célébrations de Groupe et Gains Instantanés' },
  'community.groupDesc': { pt: 'Acompanhe as maiores decolagens de amigos e jogadores de Angola, Moçambique, Portugal e do mundo.', en: 'Follow top takeoffs from players across Angola, Mozambique, Portugal, and worldwide.', fr: 'Suivez les meilleurs décollages des joueurs en Angola, Mozambique, Portugal et dans le monde.' },

  // Fairness & Security Section
  'security.title': { pt: 'SEGURANÇA & PROVABLY FAIR', en: 'SECURITY & PROVABLY FAIR', fr: 'SÉCURITÉ & PROVABLY FAIR' },
  'security.subtitle': { pt: 'Resultados matematicamente imparciais e auditáveis antes de cada decolagem', en: 'Mathematically impartial and auditable results before each flight', fr: 'Résultats mathématiquement impartiaux et auditables avant chaque vol' },
  'security.card1Title': { pt: 'Criptografia SHA-256', en: 'SHA-256 Cryptography', fr: 'Cryptographie SHA-256' },
  'security.card1Desc': { pt: 'Cada rodada gera uma semente criptográfica única combinada com a semente do cliente.', en: 'Each round generates a unique cryptographic seed combined with the client seed.', fr: 'Chaque manche génère une graine cryptographique unique combinée à celle du client.' },
  'security.card2Title': { pt: 'Saques Verificados Airtm', en: 'Verified Airtm Withdrawals', fr: 'Retraits Vérifiés Airtm' },
  'security.card2Desc': { pt: 'Levantamentos diretos processados com confirmação rigorosa em 15 a 30 minutos.', en: 'Direct withdrawals processed with strict confirmation in 15 to 30 minutes.', fr: 'Retraits directs traités avec confirmation rigoureuse en 15 à 30 minutes.' },
  'security.card3Title': { pt: 'RTP Transparente (97%)', en: 'Transparent RTP (97%)', fr: 'RTP Transparent (97%)' },
  'security.card3Desc': { pt: 'Retorno ao jogador calibrado nos padrões internacionais de jogos de colisão.', en: 'Return to player calibrated to international crash gaming standards.', fr: 'Retour au joueur calibré selon les normes internationales des jeux de crash.' },

  // FAQ Section
  'faq.title': { pt: 'PERGUNTAS FREQUENTES (FAQ)', en: 'FREQUENTLY ASKED QUESTIONS (FAQ)', fr: 'FOIRE AUX QUESTIONS (FAQ)' },
  'faq.q1': { pt: 'Qual o valor mínimo para começar a jogar?', en: 'What is the minimum bet to start playing?', fr: 'Quel est le montant minimum pour commencer à jouer ?' },
  'faq.a1': { pt: 'Você pode começar apostando apenas $1.00 USD. O jogo foi desenhado para ser acessível a todos.', en: 'You can start betting with just $1.00 USD. The game is designed to be accessible to everyone.', fr: 'Vous pouvez commencer en misant seulement 1,00 $ USD. Le jeu est conçu pour être accessible à tous.' },
  'faq.q2': { pt: 'Como faço depósitos e saques com Airtm?', en: 'How do I deposit and withdraw with Airtm?', fr: 'Comment faire des dépôts et des retraits avec Airtm ?' },
  'faq.a2': { pt: 'Basta informar o seu e-mail cadastrado na Airtm. Os depósitos são rápidos e os saques caem em 15-30 minutos.', en: 'Simply enter your registered Airtm email. Deposits are fast and withdrawals arrive within 15-30 minutes.', fr: 'Indiquez simplement votre e-mail Airtm. Les dépôts sont rapides et les retraits arrivent en 15-30 minutes.' },
  'faq.q3': { pt: 'O resultado de cada voo é realmente justo?', en: 'Is each flight result truly fair?', fr: 'Le résultat de chaque vol est-il vraiment équitable ?' },
  'faq.a3': { pt: 'Sim! Utilizamos a tecnologia Provably Fair baseada em SHA-256, permitindo que qualquer jogador audite o ponto de queda.', en: 'Yes! We use Provably Fair technology based on SHA-256, allowing any player to verify the crash point.', fr: 'Oui ! Nous utilisons la technologie Provably Fair basée sur SHA-256, permettant à chacun de vérifier le point de chute.' },
  'faq.q4': { pt: 'Existe limite diário para saques?', en: 'Is there a daily limit for withdrawals?', fr: 'Y a-t-il une limite quotidienne de retrait ?' },
  'faq.a4': { pt: 'O limite padrão diário para contas verificadas é de $500.00 USD/dia com valor mínimo de saque de $10.00 USD.', en: 'The standard daily limit for verified accounts is $500.00 USD/day with a minimum withdrawal of $10.00 USD.', fr: 'La limite quotidienne standard pour les comptes vérifiés est de 500,00 $ USD/jour avec un retrait minimum de 10,00 $ USD.' },

  // Footer
  'footer.rights': { pt: 'Todos os direitos reservados.', en: 'All rights reserved.', fr: 'Tous droits réservés.' },
  'footer.disclaimer': {
    pt: 'O Skybird é uma plataforma de entretenimento crash 3D. Jogue com responsabilidade. Proibido para menores de 18 anos.',
    en: 'Skybird is a 3D crash entertainment platform. Play responsibly. 18+ only.',
    fr: 'Skybird est une plateforme de divertissement crash 3D. Jouez de manière responsable. Interdit aux moins de 18 ans.'
  },

  // --- Game Cockpit ---
  'game.title': { pt: 'SKYBIRD 3D CRASH', en: 'SKYBIRD 3D CRASH', fr: 'SKYBIRD 3D CRASH' },
  'game.round': { pt: 'Rodada', en: 'Round', fr: 'Manche' },
  'game.waiting': { pt: 'AGUARDANDO PRÓXIMA DECOLAGEM...', en: 'WAITING FOR NEXT TAKEOFF...', fr: 'EN ATTENTE DU PROCHAIN DÉCOLLAGE...' },
  'game.countdown': { pt: 'DECOLAGEM EM', en: 'TAKEOFF IN', fr: 'DÉCOLLAGE DANS' },
  'game.flying': { pt: 'PÁSSARO EM VOO', en: 'BIRD IN FLIGHT', fr: 'OISEAU EN VOL' },
  'game.crashed': { pt: 'PÁSSARO CAIU EM', en: 'BIRD CRASHED AT', fr: 'OISEAU ÉCRASÉ À' },
  'game.bet': { pt: 'APOSTAR', en: 'BET', fr: 'MISER' },
  'game.cancelBet': { pt: 'CANCELAR APOSTA', en: 'CANCEL BET', fr: 'ANNULER MISE' },
  'game.cashout': { pt: 'SACAR', en: 'CASH OUT', fr: 'ENCAISSER' },
  'game.cashedOut': { pt: 'LUCRO SACADO!', en: 'CASHED OUT!', fr: 'GAIN ENCAISSÉ !' },
  'game.betPlaced': { pt: 'APOSTA CONFIRMADA', en: 'BET PLACED', fr: 'MISE CONFIRMÉE' },
  'game.autoBet': { pt: 'Aposta Auto', en: 'Auto Bet', fr: 'Mise Auto' },
  'game.autoCashOut': { pt: 'Saque Auto', en: 'Auto Cash Out', fr: 'Encaissement Auto' },
  'game.manualMode': { pt: 'Manual', en: 'Manual', fr: 'Manuel' },
  'game.autoMode': { pt: 'Automático', en: 'Auto', fr: 'Automatique' },
  'game.balance': { pt: 'Saldo USD', en: 'USD Balance', fr: 'Solde USD' },
  'game.liveBets': { pt: 'Apostas Ao Vivo', en: 'Live Bets', fr: 'Mises en Direct' },
  'game.allBets': { pt: 'Todas', en: 'All', fr: 'Toutes' },
  'game.myBets': { pt: 'Minhas', en: 'My Bets', fr: 'Mes Mises' },
  'game.topWinners': { pt: 'Top Ganhadores', en: 'Top Winners', fr: 'Gagnants Tops' },
  'game.player': { pt: 'Jogador', en: 'Player', fr: 'Joueur' },
  'game.betAmount': { pt: 'Aposta', en: 'Bet', fr: 'Mise' },
  'game.multiplier': { pt: 'Multiplicador', en: 'Multiplier', fr: 'Multiplicateur' },
  'game.payout': { pt: 'Ganho', en: 'Payout', fr: 'Gain' },
  'game.howToPlay': { pt: 'Como Jogar?', en: 'How to Play?', fr: 'Comment Jouer ?' },
  'game.soundOn': { pt: 'Ativar Som', en: 'Sound On', fr: 'Activer le Son' },
  'game.soundOff': { pt: 'Desativar Som', en: 'Sound Off', fr: 'Désactiver le Son' },
  'game.addPanel': { pt: '+ 2ª Aposta', en: '+ 2nd Bet', fr: '+ 2ème Mise' },
  'game.removePanel': { pt: 'Remover Painel', en: 'Remove Panel', fr: 'Supprimer Panneau' },
  'game.provablyFairAudit': { pt: 'Verificação Criptográfica (Provably Fair)', en: 'Cryptographic Audit (Provably Fair)', fr: 'Vérification Cryptographique (Provably Fair)' },
  'game.serverSeed': { pt: 'Seed do Servidor (SHA-256)', en: 'Server Seed (SHA-256)', fr: 'Seed du Serveur (SHA-256)' },
  'game.clientSeed': { pt: 'Seed do Cliente', en: 'Client Seed', fr: 'Seed du Client' },
  'game.targetMultiplier': { pt: 'Multiplicador Alvo', en: 'Target Multiplier', fr: 'Multiplicateur Cible' },

  // --- Wallet & Transactions ---
  'wallet.title': { pt: 'CARTEIRA & FINANCEIRO (USD)', en: 'WALLET & FINANCIAL (USD)', fr: 'PORTEFEUILLE & FINANCES (USD)' },
  'wallet.available': { pt: 'Saldo Disponível para Apostas', en: 'Available Balance for Betting', fr: 'Solde Disponible pour Miser' },
  'wallet.deposit': { pt: 'Depositar (Airtm)', en: 'Deposit (Airtm)', fr: 'Déposer (Airtm)' },
  'wallet.withdraw': { pt: 'Sacar (Airtm)', en: 'Withdraw (Airtm)', fr: 'Retirer (Airtm)' },
  'wallet.balanceAvailable': { pt: 'Saldo Disponível', en: 'Available Balance', fr: 'Solde Disponible' },
  'wallet.balanceLocked': { pt: 'Saldo Bloqueado / Em Análise', en: 'Locked / Under Review Balance', fr: 'Solde Bloqué / En Examen' },
  'wallet.totalBalance': { pt: 'Saldo Total', en: 'Total Balance', fr: 'Solde Total' },
  'wallet.requestDeposit': { pt: 'Solicitar Depósito (USD)', en: 'Request Deposit (USD)', fr: 'Demander un Dépôt (USD)' },
  'wallet.requestWithdraw': { pt: 'Solicitar Saque (Airtm)', en: 'Request Withdrawal (Airtm)', fr: 'Demander un Retrait (Airtm)' },
  'wallet.depositAirtmTitle': { pt: 'DEPOSITAR SALDO (USD)', en: 'DEPOSIT FUNDS (USD)', fr: 'DÉPOSER DES FONDS (USD)' },
  'wallet.depositAirtmDesc': { pt: 'Processamento oficial via carteira digital Airtm.', en: 'Official processing via Airtm digital wallet.', fr: 'Traitement officiel via portefeuille numérique Airtm.' },
  'wallet.withdrawAirtmTitle': { pt: 'LEVANTAMENTO DE SALDO (AIRTM)', en: 'WITHDRAW FUNDS (AIRTM)', fr: 'RETRAIT DE FONDS (AIRTM)' },
  'wallet.withdrawAirtmDesc': { pt: 'Retiradas oficiais de 15 a 30 minutos em sua conta Airtm.', en: 'Official 15-30 minute withdrawals to your Airtm account.', fr: 'Retraits officiels de 15 à 30 minutes vers votre compte Airtm.' },
  'wallet.minWithdraw': { pt: 'Mínimo de Saque: $10.00 USD', en: 'Minimum Withdrawal: $10.00 USD', fr: 'Retrait Minimum: 10,00 $ USD' },
  'wallet.dailyLimitVerified': { pt: 'Limite Diário: $500.00 USD/dia', en: 'Daily Limit: $500.00 USD/day', fr: 'Limite Quotidienne: 500,00 $ USD/jour' },
  'wallet.dailyLimitUnverified': { pt: 'Limite Diário (Não Verificado): $100.00 USD/dia', en: 'Daily Limit (Unverified): $100.00 USD/day', fr: 'Limite Quotidienne (Non Vérifié): 100,00 $ USD/jour' },
  'wallet.processingTime': { pt: 'Tempo de Crédito: 15 a 30 minutos', en: 'Credit Time: 15 to 30 minutes', fr: 'Temps de Crédit: 15 à 30 minutes' },
  'wallet.history': { pt: 'Histórico de Transações', en: 'Transaction History', fr: 'Historique des Transactions' },
  'wallet.adminApprovalNotice': {
    pt: 'A validação, aprovação e liberação do saldo são de inteira responsabilidade do painel Administrativo.',
    en: 'Validation, approval, and release of funds are the sole responsibility of the Administrative panel.',
    fr: "La validation, l'approbation et le déblocage des fonds relèvent de la seule responsabilité du panneau Administratif."
  },
  'wallet.statusPending': { pt: 'Aguardando Aprovação Admin', en: 'Pending Admin Approval', fr: "En attente d'approbation Admin" },
  'wallet.statusCompleted': { pt: 'Concluído / Aprovado', en: 'Completed / Approved', fr: 'Terminé / Approuvé' },
  'wallet.statusFailed': { pt: 'Recusado / Falhou', en: 'Rejected / Failed', fr: 'Refusé / Échoué' },
  'wallet.statusCancelled': { pt: 'Cancelado & Estornado', en: 'Cancelled & Refunded', fr: 'Annulé & Remboursé' },
  'wallet.airtmEmail': { pt: 'E-mail cadastrado na Airtm', en: 'Registered Airtm Email', fr: 'E-mail enregistré sur Airtm' },
  'wallet.depositAmount': { pt: 'Valor do Depósito (USD)', en: 'Deposit Amount (USD)', fr: 'Montant du Dépôt (USD)' },
  'wallet.withdrawAmount': { pt: 'Valor do Saque (USD)', en: 'Withdrawal Amount (USD)', fr: 'Montant du Retrait (USD)' },
  'wallet.confirmDeposit': { pt: 'CONFIRMAR DEPÓSITO', en: 'CONFIRM DEPOSIT', fr: 'CONFIRMER LE DÉPÔT' },
  'wallet.confirmWithdraw': { pt: 'CONFIRMAR SAQUE', en: 'CONFIRM WITHDRAWAL', fr: 'CONFIRMER LE RETRAIT' },
  'wallet.close': { pt: 'Fechar', en: 'Close', fr: 'Fermer' },

  // --- Support & Live Chat ---
  'support.title': { pt: 'SUPORTE OFICIAL SKYBIRD', en: 'OFFICIAL SKYBIRD SUPPORT', fr: 'SUPPORT OFFICIEL SKYBIRD' },
  'support.subtitle': { pt: 'Atendimento e esclarecimento de dúvidas sobre depósitos, saques e jogabilidade', en: 'Assistance and answers regarding deposits, withdrawals, and gameplay', fr: 'Assistance et réponses concernant dépôts, retraits et gameplay' },
  'support.placeholder': { pt: 'Digite sua mensagem ou dúvida...', en: 'Type your message or question...', fr: 'Tapez votre message ou question...' },
  'support.send': { pt: 'Enviar', en: 'Send', fr: 'Envoyer' },
  'support.quickTopic1': { pt: 'Como funciona o Saque Airtm?', en: 'How does Airtm withdrawal work?', fr: 'Comment fonctionne le retrait Airtm ?' },
  'support.quickTopic2': { pt: 'Qual o tempo de crédito?', en: 'What is the credit processing time?', fr: 'Quel est le délai de traitement ?' },
  'support.quickTopic3': { pt: 'Como verificar se o jogo é justo?', en: 'How to verify the game is Provably Fair?', fr: 'Comment vérifier que le jeu est équitable ?' },
  'support.busyNotice': {
    pt: 'Os membros da nossa equipa de suporte estão atendendo outros clientes, por favor aguarde que lhe responderemos em instantes.',
    en: 'Our support team members are currently assisting other clients, please wait and we will reply shortly.',
    fr: 'Les membres de notre équipe de support aident actuellement d’autres clients, veuillez patienter, nous vous répondrons sous peu.'
  },

  // --- Admin Dashboard & Login ---
  'admin.title': { pt: 'PAINEL DE CONTROLE ADMINISTRATIVO', en: 'ADMINISTRATIVE CONTROL PANEL', fr: 'PANNEAU DE CONTRÔLE ADMINISTRATIF' },
  'admin.subtitle': { pt: 'Supervisão de auditoria, ledger financeiro, aprovação de depósitos/saques e controle de RTP', en: 'Audit oversight, financial ledger, deposit/withdrawal approval, and RTP control', fr: 'Supervision des audits, registre financier, approbation des dépôts/retraits et contrôle RTP' },
  'admin.tabOverview': { pt: 'Visão Geral', en: 'Overview', fr: 'Vue Globale' },
  'admin.tabTransactions': { pt: 'Aprovações & Ledger', en: 'Approvals & Ledger', fr: 'Approbations & Registre' },
  'admin.tabUsers': { pt: 'Gestão de Usuários', en: 'User Management', fr: 'Gestion Utilisateurs' },
  'admin.tabSettings': { pt: 'Parâmetros & RTP', en: 'Settings & RTP', fr: 'Paramètres & RTP' },
  'admin.tabAudit': { pt: 'Logs de Auditoria', en: 'Audit Logs', fr: 'Journaux d’Audit' },
  'admin.approve': { pt: 'Aprovar', en: 'Approve', fr: 'Approuver' },
  'admin.reject': { pt: 'Recusar', en: 'Reject', fr: 'Refuser' },
  'admin.pendingActions': { pt: 'Ações Administrativas Pendentes', en: 'Pending Administrative Actions', fr: 'Actions Administratives en Attente' },
  'admin.loginTitle': { pt: 'ACESSO ADMINISTRATIVO RESTRITO', en: 'RESTRICTED ADMIN ACCESS', fr: 'ACCÈS ADMINISTRATIF RESTREINT' },
  'admin.loginDesc': { pt: 'Insira a chave mestre ou credenciais administrativas para gerenciar a plataforma.', en: 'Enter the master key or admin credentials to manage the platform.', fr: 'Entrez la clé maître ou les identifiants administrateur pour gérer la plateforme.' },
  'admin.enterPin': { pt: 'PIN de Acesso Admin', en: 'Admin Access PIN', fr: 'PIN d’Accès Admin' },
  'admin.loginButton': { pt: 'AUTENTICAR NO PAINEL', en: 'AUTHENTICATE IN PANEL', fr: 'S’AUTHENTIFIER DANS LE PANNEAU' },
  'admin.backToGame': { pt: 'Voltar ao Jogo', en: 'Back to Game', fr: 'Retour au Jeu' },

  // --- Auth Modal ---
  'auth.loginTitle': { pt: 'ENTRAR NA SUA CONTA', en: 'LOG IN TO YOUR ACCOUNT', fr: 'CONNEXION À VOTRE COMPTE' },
  'auth.registerTitle': { pt: 'CRIAR UMA CONTA NOVA', en: 'CREATE A NEW ACCOUNT', fr: 'CRÉER UN NOUVEAU COMPTE' },
  'auth.email': { pt: 'Endereço de E-mail', en: 'Email Address', fr: 'Adresse E-mail' },
  'auth.password': { pt: 'Senha de Acesso', en: 'Password', fr: 'Mot de Passe' },
  'auth.username': { pt: 'Nome de Usuário / Apelido', en: 'Username / Nickname', fr: 'Nom d’utilisateur / Pseudo' },
  'auth.submitLogin': { pt: 'ENTRAR AGORA', en: 'LOG IN NOW', fr: 'SE CONNECTER' },
  'auth.submitRegister': { pt: 'CRIAR CONTA & RECEBER BÔNUS', en: 'CREATE ACCOUNT & GET BONUS', fr: 'CRÉER UN COMPTE & RECEVOIR UN BONUS' },
  'auth.noAccount': { pt: 'Ainda não tem conta?', en: "Don't have an account?", fr: "Vous n'avez pas de compte ?" },
  'auth.hasAccount': { pt: 'Já possui uma conta?', en: 'Already have an account?', fr: 'Vous avez déjà un compte ?' },

  // --- Notifications ---
  'notif.depositRequestedTitle': { pt: 'Solicitação de Depósito Recebida', en: 'Deposit Request Received', fr: 'Demande de Dépôt Reçue' },
  'notif.depositApprovedTitle': { pt: 'Depósito Aprovado!', en: 'Deposit Approved!', fr: 'Dépôt Approuvé !' },
  'notif.depositRejectedTitle': { pt: 'Depósito Não Aprovado', en: 'Deposit Not Approved', fr: 'Dépôt Non Approuvé' },
  'notif.withdrawRequestedTitle': { pt: 'Solicitação de Saque Enviada', en: 'Withdrawal Request Submitted', fr: 'Demande de Retrait Soumise' },
  'notif.withdrawApprovedTitle': { pt: 'Saque Aprovado & Liberado!', en: 'Withdrawal Approved & Released!', fr: 'Retrait Approuvé & Débloqué !' },
  'notif.withdrawRejectedTitle': { pt: 'Saque Recusado / Saldo Estornado', en: 'Withdrawal Rejected / Balance Refunded', fr: 'Retrait Refusé / Solde Remboursé' },
  'notif.supportMessageTitle': { pt: 'Nova Mensagem de Suporte', en: 'New Support Message', fr: 'Nouveau Message de Support' }
};

class I18nManager {
  private currentLanguage: Language = 'pt';
  private listeners: Array<(lang: Language) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('skybird_language') as Language;
      if (saved && (saved === 'pt' || saved === 'en' || saved === 'fr')) {
        this.currentLanguage = saved;
      }
    }
  }

  public getLanguage(): Language {
    return this.currentLanguage;
  }

  public setLanguage(lang: Language) {
    this.currentLanguage = lang;
    if (typeof window !== 'undefined') {
      localStorage.setItem('skybird_language', lang);
    }
    this.notify();
  }

  public t(key: string, defaultText?: string): string {
    const item = translations[key];
    if (!item) return defaultText || key;
    return item[this.currentLanguage] || item.pt || defaultText || key;
  }

  public getActiveOption(): LanguageOption {
    return LANGUAGES.find((l) => l.code === this.currentLanguage) || LANGUAGES[0];
  }

  public subscribe(listener: (lang: Language) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentLanguage));
  }
}

export const i18n = new I18nManager();

/**
 * React Hook for seamless internationalization re-rendering
 */
export function useTranslation() {
  const [language, setLanguageState] = useState<Language>(i18n.getLanguage());

  useEffect(() => {
    const unsub = i18n.subscribe((newLang) => {
      setLanguageState(newLang);
    });
    return () => unsub();
  }, []);

  const t = (key: string, defaultText?: string): string => {
    return i18n.t(key, defaultText);
  };

  const setLanguage = (lang: Language) => {
    i18n.setLanguage(lang);
  };

  return {
    t,
    language,
    setLanguage,
    activeOption: i18n.getActiveOption(),
    languages: LANGUAGES
  };
}
