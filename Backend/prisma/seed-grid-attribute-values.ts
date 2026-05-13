/**
 * seed-grid-attribute-values.ts
 *
 * Replaces allowed values for the ACTIVE (lowercase-key) master attributes
 * using values from: FINAL GRID APPROVED-NEW - Copy.xlsx
 *
 * IMPORTANT: The DB has two sets of attributes — old uppercase keys (e.g. M_FAB2)
 * and active lowercase keys (e.g. m_fab2). The frontend only reads from the lowercase
 * ones. This script uses EXACT case-sensitive key matching to target the right ones.
 *
 * Run:
 *   npx ts-node --project tsconfig.json prisma/seed-grid-attribute-values.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

// ─── Exact DB keys → Excel values ─────────────────────────────────────────────
// Keys must match EXACTLY what's in masterAttribute.key (case-sensitive, lowercase)

const GRID_DATA: Array<{ key: string; values: string[] }> = [
  { key: 'yarn_01',           values: ['C', 'P', 'PC', 'CP', 'SPN', 'SAP', 'NYL', 'RC', 'ACR', 'TNCL', 'RYN', 'DFDL', 'VIS', 'SLK', 'PV'] },
  { key: 'main_mvgr',         values: ['CHK', 'DNM_CHK', 'DNM_PRT', 'DNM_SLD', 'DNM_STP', 'OD', 'PRT', 'SLD', 'STP'] },
  { key: 'fabric_main_mvgr',  values: ['DNM_CHK', 'DNM_PRT', 'DNM_SLD', 'E_STP', 'H_STP', 'OD_CHK', 'OD_CLOUD', 'OD_OMBRE', 'OD_PRT', 'OD_SLD', 'OD_STP', 'OD_T&D', 'PRT', 'PRT_ABST', 'PRT_ANML', 'PRT_BAGRU', 'PRT_BNDN', 'PRT_BOOTY', 'PRT_CHK', 'PRT_CLOUD', 'PRT_CRTN', 'PRT_DGTL', 'PRT_FLRL', 'PRT_IKAT', 'PRT_KLMKR', 'PRT_LHRY', 'PRT_POLKA', 'PRT_SCARF', 'PRT_TRPL', 'PRT_TYPO', 'SLD', 'V_STP', 'YD_CHK', 'IND_CHK', 'PRT_GMTL'] },
  { key: 'weave',             values: ['8_SNGL', 'ALPN', 'ANTP', 'ART_SLK', 'BBL', 'BBY_SFT', 'BRLN', 'BOND', 'BTR_LV', 'BTR_NS', 'B_EYE', 'CAM', 'CHF', 'CHM', 'CHN', 'CHNN', 'CHN_BND', 'CNVS', 'CORD', 'CRCET', 'CRP', 'DNM', 'DNM_KNIT', 'DRBY_RIB', 'DRF', 'DTY', 'DUPN', 'D_CLTH', 'FENDY_SLK', 'FK_CTN', 'FLC', 'FLFL', 'FLNL', 'FNCY_KNIT', 'FRTNR', 'FUR', 'GLASS_SLK', 'HRY', 'H_D', 'IKAT', 'IMP', 'IND', 'IND_D_CLTH', 'IND_TWL', 'INJ_RIB', 'INL', 'INL_DNL', 'JUTE', 'KRR', 'LNCR', 'LPR', 'LTHR', 'LZBZ', 'MESH', 'MLNO', 'MKLN', 'ML_TPU', 'MMRY', 'MNK', 'MOD', 'MONO', 'MSLN', 'MUFF', 'NET', 'NS', 'ORGNZ', 'OTLDR', 'OXF', 'PSHMN', 'PIQ', 'PLFL', 'PLR_FLC', 'POP', 'PU', 'PU_SHINE', 'PVC', 'RBSTP', 'RIB', 'RIB_DRBY', 'RICE_KNIT', 'RMN_SLK', 'SCUBA', 'SHRP', 'SIMR', 'SJ', 'PU_SKIN', 'SLK_DNM', 'SPR_SFT', 'SWD', 'S_PLY', 'T400', 'TFT', 'THML', 'TK', 'TPU', 'TR', 'TRC', 'TRY_BRY', 'TSR', 'TWD', 'TWL', 'TWL_IND', 'TWL_CVLR', 'VELR', 'VLV', 'VOIL', 'VTCN', 'V_RIB', 'WFL', 'WLN', 'WLN_KNIT', 'ZARA_DBY', 'DFNDR', 'ZRCH', 'VSLN', 'SRSKR', 'ROLEX_FLC', 'ROMA', 'PCRN', 'OTMN', 'GGT', 'FL_KNIT', 'BRKN_TWL', 'STN', 'TRY', 'LINN', 'COD_KNIT', 'MTY', 'PLMD', 'SPNDX', 'KHNR'] },
  { key: 'm_fab2',            values: ['1*1', '1*4', '2*1', '2*2', '2THRD', '3*1', '3*3', '4*1', '4*3', 'BOND', 'BRASO', 'BRSHG', 'CRNCL', 'CRUS', 'DBY', 'DGNL', 'D_NDL', 'EMBS', 'FDSTP', 'FOMA', 'GRDL', 'HNYCMB', 'HRNGBN', 'INJ', 'JAQ', 'LRX', 'MLNG', 'NEPS', 'PLFL', 'POINTAL', 'QLT', 'SHFL', 'SLUB', 'SRSKR', 'STRT', '3THRD', 'AUSTP', 'BRN_OUT', '-'] },
  { key: 'f_count',           values: ['100D', '10L', '10S', '150D', '2/20S', '2/30S', '2/40S', '2/50S', '2/80S', '20"', '200D', '20D', '20S+20S', '24S', '24S/ 24S /10S', '24S+20S', '25L', '30S', '30S/ 30S /10S', '30S/ 30S /12S', '34S', '34S/ 34S /10S', '34S/ 34S /12S', '36S', '40"', '40D', '40L', '40S', '450D', '50D', '50S', '60S', '75D+20D', '75S+75S', '80S', '-'] },
  { key: 'gsm',               values: ['100-120', '120-140', '140-160', '160-180', '180-200', '200-220', '220-240', '240-260', '260-280', '280-300', '300-320', '320-340', '340-360', '360-380', '380-400', '400-420', '420-440', '440-460', '460-480', '480-500', '500-525', '525-550', '60-80', '80-100', '-'] },
  { key: 'f_ounce',           values: ['10 OZ', '11 OZ', '12 OZ', '13 OZ', '14 OZ', '15 OZ', '5 OZ', '7 OZ', '8 OZ', '9 OZ', '-'] },
  { key: 'f_construction',    values: ['101*53', '101*56', '104*44', '106*90', '108*76', '110*45', '110*80', '114*98', '116*88', '120*70', '124*60', '124*64', '125*64', '128*78', '132*64', '132*72', '140*90', '144*72', '155*80', '160*128', '162*92', '178*74', '180*100', '185*104', '200*180', '204*96', '210*110', '220*95', '350*200', '48*36', '48*48', '52*44', '52*52', '54*48', '56*52', '56*56', '60*60', '62*40', '64*54', '64*64', '65*54', '65*56', '68*52', '68*54', '68*68', '70*70', '72*64', '74*62', '75*48', '75*54', '78*56', '78*66', '84*56', '84*74', '85*64', '86*54', '92*120', '92*80', '96*48', '96*84', '143*79', '100*86', '142*102', '132*100', '144*96', '-'] },
  { key: 'composition',       values: ['100%_C', '100%_C_MLNG', '100%_JUTE', '100%_MOD', '100%_NYL', '100%_P_MLNG', '100%_P', '100%_RYN', '100%_SLK', '100%_VIS', '44%_VIS_39%_C_17%_LINN', '70%_C_30%_P', '75%_VIS_25%_P', '75%_C_25%_LINN', '80%_C_20%_P', '80%_P_20%_NYL', '80%_C_20%_LINN', '85%_C_15%_LYC', '86%_VIS_14%_NYL', '90%_P_10%_LYC', '92%_C_8%_LYC', '92%_P_8%_LYC', '93%_C_7%_LINN', '95%_C_5%_LYC', '95%_C_MLNG_5%_LYC', '95%_C_5%_SPDX', '95%_NYL_5%_LYC', '95%_P_MLNG_5%_LYC', '95%_P_5%_LYC', '95%_VIS_MLNG_5%_LYC', '95%_VIS_SLUB_5%_LYC', '95%_VIS_5%_LYC', '97%_C_MLNG_3%_LYC', '97%_C_3%_LYC', '97%_P_MLNG_3%_LYC', '97%_P_3%_LYC', '97%_VIS_SLUB_3%_LYC', '98%_C_MLNG_2%_LYC', '98%_C_2%_LYC', '98%_P_MLNG_2%_LYC', '98%_P_2%_LYC', '98%_VIS_MLNG_2%_LYC', '98%_VIS_SLUB_2%_LYC', '98%_VIS_2%_LYC', '52%_C_48%_P', '100%_VIS_MLNG', '100%_VIS_SLUB', '100%_LINN', '100%_P_SPACE_DYED', '75%_P_25%_SLK', '60%_C_40%_MOD', '40%_C_60%_P', '40%_P_60%_NYL', '60%_C_40%_P', '60%_NYL_40%_P', '60%_P_40%_NYL', '60%_P_40%_VIS', '67%_C_33%_P', '67%_VIS_33%_P', '85%_P_15%_LYC', '100%_C_SLUB', '75%_C_25%_P', '75%_C_25%_VIS', '80%_P_20%_LINN', '85%_VIS_15%_NYL', '90%_NYL_10%_SPNX', '92%_C_8%_P', '95%_P_5%_SPDX', '97%_VIS_3%_LYC', 'ACR', 'ACR_50%_WOOL_50%', 'C_60%_P_40%_RECYCLE', 'GRDL_C_50%_P_50%', 'INJ_C_95%_P_DYED_5%', 'WLN', '97%_VIS_MLNG_3%_LYC', '80%_P_20%_C', '-'] },
  { key: 'finish',            values: ['BIO', 'BIO_SIL', 'BRSHG', 'CRBN_FNSH', 'DBL_BIO', 'DRM_WASH', 'DRMG', 'DRY_ARO_FNSH', 'GOLD_FNSH', 'GMNG', 'HEAT_SET', 'LFR', 'MRSR', 'MSTR_WCKG', 'NS_FNSH', 'NANO_FNSH', 'OPEN_FNSH', 'PCH_FNSH', 'RSN_FNSH', 'SLCN', 'SING', '-'] },
  { key: 'f_width',           values: ['38"', '40"', '44"', '48"', '50"', '52"', '54"', '56"', '58"', '60"', '62"', '64"', '66"', '68"', '70"', '72"', '74"', '76"', '78"', '80"', '84"', '90"', '-'] },
  { key: 'lycra_non_lycra',   values: ['N_LYC', '4W_LYC', '2W_LYC'] },
  { key: 'neck',              values: ['BOAT_NK', 'SCOOP_NK', 'RN_ZIP', 'VN', 'TIE_UP_NK', 'OFF_SLDR', 'ONE_SLDR', 'HUD', 'CWL_NK', 'HNL_NK', 'SWHRT', 'TRTL_NK', 'RN', 'WIDE_NK', 'HN', 'SQR_NK', 'CHKR_NK', 'HLTR_NK', 'KEY_HL_NK', '-'] },
  { key: 'neck_details',      values: ['LG_RIB_NK', 'BRND_RIB_NK', 'SNAP_BTN_SLDR_NK', 'ZARA_NK', 'RN_HALF_ZIP', 'HNL_HALF_ZIP', 'HUD_HALF_ZIP', 'CNT_FAB_NK_BND', 'HN_HUD', 'HNL_NK_4_BTN', 'HNL_NK_2_BTN', 'JAQ_RIB_NK', 'HNL_NK_3_BTN', 'RIB_CUT_TPNG_NK', 'RIB_TPNG_NK', 'DTM_RIB_NK', 'CNT_RIB_NK', 'HNL_NK_5_BTN', 'RAW_EDGE_NK', 'VN_HUD', 'RN_HUD', 'CLR_WTH_HUD', '-'] },
  { key: 'collar',            values: ['ONE_PC_CLR', 'HALF_ZIP_CLR', 'RIB_CLR_WTH_BND', 'LPL_CLR', 'CUBAN_CLR', 'RIB_CLR', 'DEZ_CLR', 'MAND_CLR', 'SELF_FAB_CLR', 'REG_CLR', 'BTN_DWN_CLR', 'SHWL_CLR', 'SHWL_LPL_CLR', 'BND_CLR', 'NTCH_LPL_CLR', 'PEAK_LPL_CLR', 'RIB_CLR_WO_BND', 'FUR_CLR', 'SELF_CLR', '-'] },
  { key: 'collar_style',      values: ['RIB_PLN_CLR', 'RIB_1_TPNG_CLR', 'RIB_2_TONE_CLR', 'JAQ_CLR', 'BRND_NM', 'BRND_LG', 'RIB_2_TPNG_CLR', 'RIB_3_TPNG_CLR', 'RIB_MULTI_TPNG_CLR', 'JONNY_CLR', 'RIB_TPNG_CLR', 'DNM_CLR', 'CNT_FAB_CLR', 'DBL_CLR', 'CNT_CLR', 'TXT_CLR', '-'] },
  { key: 'sleeve',            values: ['PUFF_SLV', 'CAP_SLV', 'DLMN_SLV', 'TPNG_SLV', 'STRP', 'BTRFLY_SLV', 'BELL_SLV', 'KFTN_SLV', 'FLR_SLV', 'CUF_SLV', 'RGLN_SLV', 'SHRT_SLV', 'DRP_SLV', 'ONE_SLDR', 'REG_SLV', 'BISHOP_SLV', 'BTWNG', 'DR_SLV', 'SL', 'QTR_SLV', 'WO_CUF_SLV', 'DOC_SLV', 'CLD_SLDR', '-'] },
  { key: 'sleeve_fold',       values: ['WTH_LACE', 'WTH_PIPING', 'WTH_BNDG', 'RAW_EDGE', 'ROLL_UP', 'INSIDE_FOLD', 'SELF_FOLD', 'WTH_TPNG', 'EXTND_SLV', 'WTH_LOOP', 'HALF_RIB_HALF_FAB', 'UP_FOLD', 'WTH_ELST', '-', 'RIB_FOLD'] },
  { key: 'placket',           values: ['BRND_PRT_PLKT', 'EMB_PLKT', 'BOX_PLKT', 'JONNY_CLR_PLKT', 'POLO_PLKT', 'ZIP_BTN_PLKT', 'ZIP_RIB_PIP_PLKT', 'RIB_PLKT', 'LP_BTN_PLKT', 'LYR_PLKT', 'ZIP_PLKT', 'FRNCH_PLKT', 'DBL_PLKT', 'MOCK_PLKT', 'JAQ_PLKT', 'TXT_PLKT', 'PLN_PLKT', 'CON_ZIP_PLKT', 'STRGT_PLKT', 'SELF_PLKT', '-'] },
  { key: 'father_belt',       values: ['FLEXI', '3/4TH_ELST', 'FULL_ELST', 'FXD_BLT', 'EXTND_BLT', 'O_ELST', 'I_ELST', 'HALF_ELST', '-'] },
  { key: 'child_belt',        values: ['BRND_LG_BLT', 'C&S_ELST_BLT', 'ELST_BLT_WTH_FRL', 'GTHR_BLT', 'RIB&SELF_C&S_BLT', 'RIB_CNT_BLT', 'SELF_BLT', 'SELF_C&S_BLT', 'TOP_BLT_TPNG', '-'] },
  { key: 'bottom_fold',       values: ['WD_ADJSTR', 'SCLP', 'LACE_FNSH', 'BTM_FRNG', 'WTH_ELST_ADJSTR', 'BTM_OPEN', 'BTM_RIB', 'CRVD', 'WTH_GUSSETS', 'SIDE_SLIT', 'REG_FOLD', 'WTH_BTN', 'SMKG', 'TPNG', 'CNT_BTM_FOLD', 'RAW_EDGE', 'BTM_DORI_STP', 'WTH_ZIP', 'SELF_FOLD', 'UP_FOLD', 'KNOT', 'BTM_FRL', 'FULL_ELST', 'HALF_ELST', '-'] },
  { key: 'pocket_type',       values: ['STRT_PKT', 'SCOOP_PKT', 'GTHR_PKT', 'SLANT_PKT', 'CRS_BONE_PKT', 'DBL_PKT_WO_FLP', 'INSEAM_PKT', '2_PTCH_PKT', 'V_BONE_PKT', 'B_PLEAT_PKT', 'BONE_PKT', 'FLAP_PKT', 'CRS_PKT', 'ZIP_PKT', 'V_PTCH_PKT', 'CRNR_CUT_PKT', 'C_BONE_PKT', 'PTCH_PKT_FLAP', 'KNGR_PKT', 'SQR_PTCH_PKT', 'H_BONE_PKT', 'NO_PKT', 'LP_PKT', 'CRG_PKT_WD_TAPE', 'PTCH_PKT', 'SIDE_RIB_PKT', 'DBL_PKT_WTH_FLP', 'PKT_WTH_SIDE_RIB', 'SIDE_PKT', 'PKT_WTH_FLAP', 'RND_PKT', 'WELT_PKT', '-'] },
  { key: 'no_of_pocket',      values: ['7_PKT', '6_PKT', '1_PKT', '4_PKT', '2_PKT', '3_PKT', '8_PKT', '9_PKT', '5_PKT', '10_PKT', '-'] },
  { key: 'extra_pocket',      values: ['COIN_PKT', 'SLV_PKT', 'PENCL_PKT', 'BONE_PKT', '-'] },
  { key: 'length',            values: ['HIP_LNGTH', 'WAIST_LNGTH', 'REG_LNGTH', 'CROP_LNGTH', 'MID_LNGTH', 'BELOW_KNEE', 'SHORT_LNGTH', 'ANK_LNGTH', 'FULL_LNGTH', 'KNEE_LNGTH', 'LONG_LNGTH', 'CALF_LNGTH', 'MIDTHIGH_LNGTH', '-'] },
  { key: 'fit',               values: ['STRGHT_FIT', 'FLARE_FIT', 'SLIM_FIT', 'RELAX_FIT', 'EMPIRE_FIT', 'TIGHT_FIT', 'ULTRA_BGY_FIT', 'SKNY_FIT', 'WD_LEG', 'BLN_FIT', 'REG_FIT', 'BGY_FIT', 'B_CUT_FIT', 'ATHLETIC_FIT', 'D_SHLD', 'JGR_FIT', 'N_FIT', 'FULL_COVRG_FIT', 'BARRL_FIT', 'MUSCLE_FIT', 'A_LINE_FIT', 'LOOSE_FIT', 'PLUNGE_FIT', 'BOXY_FIT', 'MOM_FIT', 'BELL_BTM_FIT', 'BOYFRND_FIT', 'OVERSIZED_FIT', 'DEMI_FIT', 'TAPRD_FIT', '-'] },
  { key: 'body_style',        values: ['1_LYR', '2_C&S', '2_H_C&S', '2_LYR', '2_V_C&S', '2PC', '3_C&S', '3_H_C&S', '3_LYR', '3_V_C&S', '3PC', '4_C&S', '4_LYR', '4PC', '5PC', 'AFGHANI', 'ANGRKH', 'ASYM', 'BLCN', 'BIAS_CUT', 'BIKER', 'BIKINI', 'BK_LESS', 'BOMBER', 'BOY_SHORT', 'BRLT', 'BRIEF', 'BSC', 'BUILT_IN_BRA', 'C&S', 'C&S_LACE', 'C_BRA_NON_PAD', 'CAMI_BRA_PAD', 'CAPRI', 'CARGO', 'CHNKR', 'CHRDR', 'CO_SET', 'CRS_BK', 'CYC', 'DHOTI', 'DOLL', 'DNRY', 'EAR_BND', 'FDNG', 'FISH_CUT', 'FLR', 'FNCY', 'FO_WO_BTN', 'FO_WTH_BTN', 'FO_WTH_ZIP', 'FO_ZIP', 'FRAYD', 'FRK_STL', 'FRNCH', 'FRNT_JAQ', 'FRNT_SIDE_KNOT', 'FRNT_YOKE', 'FRNT_OPN', 'FRY_BTM', 'GTHR', 'H&L', 'H_C&S', 'HALF_ZIP', 'HIPSTER', 'HOT_PANT', 'HVY_TRNG', 'INJCT_FLNG', 'JDPR', 'JGR', 'JHABLA', 'JKT', 'KFTN', 'KRCHI', 'KNOT', 'KORN', 'KOTI', 'KURTA', 'L_TRNG', 'LYR', 'LEGG', 'LIGHT_PAD', 'MTRNY', 'MIDI', 'NON_FRAYD', 'NON_PAD', 'NURSG', 'OFF_SLDR', 'PAD', 'PADD(B)', 'PADD(C)', 'PNL', 'PANT', 'PARKA', 'PRD_PNTY', 'P_TUCK', 'PLAZO', 'PLTD', 'POM', 'PRTY_WEAR', 'PUFFER', 'PUSH_UP', 'PYJAMA', 'QLT', 'RCR_BK', 'REG_FLR', 'REM_PAD', 'RMPR', 'ROPE', 'RUCH', 'RFLS', 'RVSL', 'SEAMLESS', 'SHACKET', 'SHRT', 'SHRUG', 'SKIRT', 'SKULL', 'SMKG', 'STICK_ON', 'STOLE', 'STRP_LES', 'SWAG', 'T_SHIRT', 'THONG', 'TIERED', 'TMY_TUCKER', 'TOP', 'TOP_POM', 'TOUCH', 'TRNG', 'TRUNK', 'TUBE_BRA', 'TUNIC', 'U_CUT', 'VRSTY', 'WIRED', 'WRAP', 'WTH_INR', '-'] },
  { key: 'drawcord',          values: ['SELF_FAB_DC', 'RFD_DC', 'BRDD_DC', 'TWST_DC', 'FNCY_DC', 'DBL_DC', 'JAQ_DC', 'T&D_DC', 'PRT_DC', 'BRND_NM_DC', 'SLD_DC', 'NEON_DC', 'MLNG_DC', 'EDGE_BRND_PRT', 'EDGE_LG_PRT', 'MULT_CLR', '-'] },
  { key: 'dc_shape',          values: ['FLAT_DC', 'RND_DC', '-'] },
  { key: 'zipper',            values: ['PLST_ZIP', 'RVSL_ZIP', 'MTL_ZIP', 'NYL_ZIP', 'CON_ZIP', 'VIS_ZIP', '-'] },
  { key: 'zip_colour',        values: ['GOLD', 'DTM', 'MULT_CLR', 'GUN_MTL', 'SLVR', 'BLK', 'WHT', 'RFD', '-'] },
  { key: 'button',            values: ['POLY_BTN', 'MTL_BTN', 'WDN_BTN', 'HORN_BTN', 'PRL_BTN', 'SHELL_BTN', 'FNCY_BTN', 'SNAP_BTN', 'KUNDI_BTN', 'DYE_CAST_BTN', '-'] },
  { key: 'btn_colour',        values: ['DTM', 'WHT', 'BLK', 'CPR', 'GUN_MTL', 'NIKL', 'SLVR', 'GOLD', '-'] },
  // patches_type (label: M_PATCH_STYLE) → patch style values: ANML, BRND_LG, etc.
  { key: 'patches_type',      values: ['ANML', 'BRND_LG', 'CRTN', 'NUM', 'TYPO', '-'] },
  // patches (label: M_PATCHE_TYPE) → patch material values: D_MASS, CNVS, etc.
  { key: 'patches',           values: ['D_MASS', 'CNVS', 'PVC', 'SLCN', 'FELT', 'RBR', 'TOWEL', 'LSR_CUT', 'EMBS', 'EMB', 'PU', 'LTHR_PTCH', 'WOVEN', 'MTL', '-'] },
  { key: 'htrf_style',        values: ['ANML', 'BRND', 'CRTN', 'NUM', 'TYPO', 'FIGR', 'ABST', 'FLRL', 'NATUR', 'SPRTS', '-'] },
  { key: 'htrf_type',         values: ['PLSTS', 'HD', 'PUFF', 'KHADI', 'FLOCK', 'FOIL', 'RFLC', 'DGTL', 'STONE', 'SEQ', '-', 'GLTR', 'SLCN'] },
  { key: 'print_placement',   values: ['FRNT_BTM_HEM', 'BK_BTM_HEM', 'CHST', 'SLV', 'BK', 'SIDE_CHST', 'SIDE_HEM', 'FRNT_SLDR', 'BK_SLDR', 'PKT', 'NK', '-', 'FRNT_BK', 'FRNT_BK_SL'] },
  { key: 'print_style',       values: ['BRND', 'ANML', 'CRTN', 'NUM', '-', 'SLGN', 'FLRL', 'ETHNC', 'ABST', 'CHRCTR'] },
  { key: 'print_type',        values: ['FLOCK', 'DCHRG', 'SLVR_FOIL', 'GLDN_FOIL', 'DGT_PRT', 'PLSTSL_PRT', 'HD', 'PIGMENT', 'SBLMTN', 'RBR_PRT', 'KHADI', 'SHMR', 'PUFF', 'EMBS', 'REFLCTV_PRT', '-', 'SPRY_PRT', 'PH_PRT'] },
  // embroidery (label: M_EMB_TYPE) → embroidery method: HAND, MCHN, -
  { key: 'embroidery',        values: ['HAND', 'MCHN', '-'] },
  // embroidery_type (label: M_EMBROIDERY_STYLE) → embroidery style: DORI, THRD_WRK, etc.
  { key: 'embroidery_type',   values: ['DORI', 'THRD_WRK', 'BRND_EMB', 'LOGO_EMB', 'BEAD', 'MRR', 'SEQ_WRK', 'STONE', 'CUT_WRK', 'SMKG', 'APPLIQUE', '-', 'ZARI', 'AARI', 'KANTHA', 'PHLKARI', 'TWL_EMB'] },
  { key: 'emb_placement',     values: ['CHST', 'PKT', 'BK', 'COLLAR', 'PLKT', 'CUFF', 'INSIDE_YOKE', 'SLV', 'BLT', 'FRNT_BLT', 'BK_BLT', 'FRNT_BK', 'FRNT_BK_BLT', 'INR_BLT', 'COIN_PKT', 'BK_PKT', 'ABV_BONE_PKT', 'FRNT_PKT_CRNR', 'SIDE_CHST', 'BTM_HEM', 'NK', 'SLDR', 'FRNT_EDGE', 'FRNT', 'BTM', '-'] },
  { key: 'wash',              values: ['OD_ACID', 'OD_ENZ', 'OMBRE', 'OD_BLAST', 'T&D', 'ENZ_WSH', 'CLOUD', 'SLCN_SFTNR', 'STN_WSH', 'TWL_WSH', 'ACID_WSKR', 'ACID_RSN', 'ACID_BLST', 'OD_TWL', 'OD_T&D', 'RINSE_WSH', 'PP_WHSKR_ENZM', 'OD_TOWL_WSH', 'TINT_WSH', 'SAND_WSH', 'OD', 'ACID_WSH', 'BIO_WSH', '-'] },
  { key: 'age_group',         values: ['BABY BOOMER (62-82Y)', 'GEN X (46-61Y)', 'MILLENIALS (30-45Y)', 'GEN Z (13-29Y)', 'GEN ALPHA (0-12Y)', 'ALL GROUP'] },
  { key: 'imp_atrbt2',        values: ['SLD', 'PRT_CHEST', 'PRT_TRPL', 'PRT_ABST', 'PRT_GMTL', 'PRT_CHKS', 'OD_SLD', 'PRT_CLOUD', 'OD_OMBRE', 'OD_T&D', 'STRT', 'JAQ', 'H_STP', 'E_STP', 'V_STP', 'PRT_BOOTY', 'PRT_TYPO', 'TXT', 'AOP', 'SW', 'SLD_BSC', 'SLD_C&S', 'K_SLD', 'K_PRT', 'W_AOP', 'W_SLD', 'W_YD_CHK', 'IMP_SLD', 'IMP_PRT', 'IND_SLD', 'IND_PRT', 'WHT', 'COLOR', 'OD', 'POLY', 'CHK', 'PRT', 'CRG', 'BSC', 'PRT_FLRL', 'YD_CHKS', 'IND_CHK', 'OD_CHK', 'PRT_SCARF', 'FNCY', 'STP', 'EAR_CAP', 'PU', 'C&S', 'KNIT', 'SLIM', 'LOOSE', 'STRAIGHT', 'DZNR_JNS', 'SPARKY', 'DYED', 'DNM'] },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function replaceAttributeValues(key: string, newValues: string[]): Promise<boolean> {
  // Exact case-sensitive lookup — targets only the correct lowercase attribute
  const attr = await prisma.masterAttribute.findUnique({ where: { key } });
  if (!attr) {
    console.warn(`⚠️   NOT FOUND: "${key}"`);
    return false;
  }

  await prisma.attributeAllowedValue.deleteMany({ where: { attributeId: attr.id } });

  await prisma.attributeAllowedValue.createMany({
    data: newValues.map((v, i) => ({
      attributeId: attr.id,
      shortForm: v,
      fullForm: v,
      displayOrder: i,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  return true;
}

async function main() {
  console.log('🌱 Seeding attribute allowed values (targeting lowercase active attributes)\n');

  let updated = 0;
  let failed = 0;

  for (const entry of GRID_DATA) {
    const ok = await replaceAttributeValues(entry.key, entry.values);
    if (ok) {
      console.log(`✅  ${entry.key.padEnd(25)} → ${entry.values.length} values`);
      updated++;
    } else {
      failed++;
    }
  }

  console.log(`\n✅ Done. Updated ${updated}/${GRID_DATA.length} attributes.`);
  if (failed > 0) {
    console.log(`⚠️  ${failed} key(s) not found — check exact spelling in DB.`);
  }
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
