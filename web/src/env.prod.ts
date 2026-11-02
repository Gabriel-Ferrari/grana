// Project URL e publishable key do Supabase. São públicas; RLS protege os dados.
export const env = {
    production: true,
    supabaseUrl: 'https://mfsblnrygzwdefvnezas.supabase.co',
    supabaseKey: 'sb_publishable_vtrYjybn0MZ4Q_cg629qmg_eeVkexO_',
    /** chave pública VAPID dos avisos (a privada fica no secret VAPID_KEYS da função remind) */
    vapidPublic: 'BN14BsyRm7M_bfqIKCfMAg-61ptZ4fuj1RcaXqmeoUSQ2dCo1RzVmDP6526Vx6DybPxz7JZUG8t1MwknK8mRxns',
};
