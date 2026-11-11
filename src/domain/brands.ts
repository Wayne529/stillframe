const brandLogos: Record<string, string> = Object.fromEntries(
  ['nikon', 'fujifilm', 'canon', 'leica', 'hasselblad', 'sony', 'apple', 'huawei', 'xiaomi'].map(
    (id) => [id, `/brands/${id === 'nikon' ? 'nikon-yellow' : id}.png`],
  ),
);
export const cameraBrands = [
  { id: 'nikon', name: '尼康', make: 'Nikon', aliases: ['nikon', 'nikon corporation'] },
  {
    id: 'fujifilm',
    name: '富士',
    make: 'FUJIFILM',
    aliases: ['fujifilm', 'fuji', 'fuji photo film', 'fujifilm corporation'],
  },
  { id: 'canon', name: '佳能', make: 'Canon', aliases: ['canon', 'canon inc'] },
  { id: 'leica', name: '徕卡', make: 'Leica', aliases: ['leica', 'leica camera ag'] },
  {
    id: 'hasselblad',
    name: '哈苏',
    make: 'Hasselblad',
    aliases: ['hasselblad', 'hasselblad ab', 'victor hasselblad ab'],
  },
  { id: 'sony', name: '索尼', make: 'SONY', aliases: ['sony', 'sony corporation'] },
  {
    id: 'panasonic',
    name: '松下',
    make: 'Panasonic',
    aliases: ['panasonic', 'lumix', 'panasonic corporation'],
  },
  { id: 'ricoh', name: '理光', make: 'RICOH', aliases: ['ricoh', 'ricoh imaging company ltd'] },
  { id: 'pentax', name: '宾得', make: 'PENTAX', aliases: ['pentax', 'pentax corporation'] },
  {
    id: 'om',
    name: '奥之心 / 奥林巴斯',
    make: 'OM SYSTEM',
    aliases: [
      'om system',
      'om digital solutions',
      'olympus',
      'olympus imaging corp',
      'olympus corporation',
    ],
  },
  { id: 'dji', name: '大疆', make: 'DJI', aliases: ['dji', 'sz dji technology co ltd'] },
  { id: 'apple', name: '苹果', make: 'Apple', aliases: ['apple'] },
  { id: 'huawei', name: '华为', make: 'HUAWEI', aliases: ['huawei', 'huawei technologies co ltd'] },
  {
    id: 'xiaomi',
    name: '小米',
    make: 'Xiaomi',
    aliases: ['xiaomi', 'xiaomi communications co ltd', 'redmi'],
  },
];
const normalize = (value: string) =>
  value.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
export function matchBrand(make: string, model = '') {
  const normalized = normalize(make);
  if (/^pentax\b/i.test(model) && (!normalized || /^(ricoh|pentax)\b/.test(normalized)))
    return cameraBrands.find((b) => b.id === 'pentax');
  return cameraBrands.find((b) =>
    b.aliases.some((a) => normalized === normalize(a) || normalized.startsWith(normalize(a) + ' ')),
  );
}

// The supplied archive is the only source for built-in brand artwork.
export function cameraLogo(make: string, model = '') {
  const brand = matchBrand(make, model);
  return brand ? brandLogos[brand.id] : undefined;
}
export function cameraModel(make: string, model: string) {
  const brand = matchBrand(make, model);
  const prefixes = [make, brand?.make ?? '', ...(brand?.aliases ?? [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const prefix of prefixes)
    if (model.toLowerCase().startsWith(prefix.toLowerCase() + ' '))
      return model.slice(prefix.length).trim();
  return model;
}
export function cameraLayout(width: number, height: number, iw: number, ih: number, model: string) {
  const boxWidth = model ? width * 0.38 : width;
  const padding = Math.min(4, height / 8, boxWidth / 8);
  const scale = Math.min((boxWidth - padding * 2) / iw, (height - padding * 2) / ih);
  const logo = { x: padding, y: (height - ih * scale) / 2, width: iw * scale, height: ih * scale };
  const textX = boxWidth + Math.min(12, width * 0.04);
  return { logo, boxWidth, textX, textWidth: Math.max(0, width - textX) };
}
