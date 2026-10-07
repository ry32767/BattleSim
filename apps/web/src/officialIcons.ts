/** S17: external references for the user's personal display; images are not bundled. */
export const officialIcons: Readonly<Record<string, string>> = {
  char_01: '18', char_03: '02', char_04: '80', char_05: '51', char_06: '36',
  char_07: '42', char_08: '48', char_09: '79', char_10: '38', char_11: '60',
  char_12: '35', char_13: '40', char_14: '49', char_15: '19', char_16: '43',
  char_17: '59', char_18: '72', char_19: '55', char_20: '47', char_21: '32',
  char_22: '56', char_23: '64', char_24: '23', char_25: '67', char_26: '45',
  char_27: '01', char_28: '63', char_29: '34', char_30: '57', char_31: '03',
  char_32: '39', char_33: '44', char_34: '71', char_35: '53', char_36: '81',
  char_37: '61', char_38: '68', char_39: '76', char_40: '52', char_41: '65',
  char_42: '73', char_43: '69', char_45: '11', char_46: '17', char_47: '16',
  char_48: '12', char_51: '21', char_53: '22', char_54: '25', char_55: '24',
  char_56: '27', char_57: '28', char_58: '29', char_59: '30', char_60: '31',
  char_64: '75',
};
export function officialIconUrl(presetId: string): string | undefined {
  const id = /^(char_\d{2})(?:-|$)/.exec(presetId)?.[1] ?? presetId;
  return officialIcons[id] ? `https://worldtrigger.info/img/quiz/top/${officialIcons[id]}.jpg` : undefined;
}

/** Public builds use authored badges; private local use is an explicit opt-in. */
export function displayIconUrl(presetId: string): string | undefined {
  return import.meta.env.VITE_USE_OFFICIAL_ICONS === 'true' ? officialIconUrl(presetId) : undefined;
}
