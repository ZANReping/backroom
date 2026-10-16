/** Complete vertical building boards used by L11 facade dressing. */
export const L11_VERTICAL_SIGNS = [
  {
    id: 'pegasus', width: 2.3, height: 14, depth: .12,
    albedo: 'l11-inspected-pegasus.png', lowAlbedo: 'l11-inspected-pegasus_low.png',
    normal: 'l11-inspected-pegasus_normal.png', roughness: 'l11-inspected-pegasus_roughness.png',
    source: 'assets/l11-reference-signs-v2/manifest.json',
  },
  {
    id: 'hotel', width: 1.3, height: 6.5, depth: .12,
    albedo: 'l11-vertical-hotel.png', lowAlbedo: 'l11-vertical-hotel_low.png',
    normal: 'l11-vertical-hotel_normal.png', roughness: 'l11-vertical-hotel_roughness.png',
    source: 'assets/l11-vertical-signs/manifest.json',
  },
  {
    id: 'clinic', width: 1.2, height: 6, depth: .12,
    albedo: 'l11-vertical-clinic.png', lowAlbedo: 'l11-vertical-clinic_low.png',
    normal: 'l11-vertical-clinic_normal.png', roughness: 'l11-vertical-clinic_roughness.png',
    source: 'assets/l11-vertical-signs/manifest.json',
  },
  {
    id: 'cinema', width: 1.5, height: 7.5, depth: .16,
    albedo: 'l11-vertical-cinema.png', lowAlbedo: 'l11-vertical-cinema_low.png',
    normal: 'l11-vertical-cinema_normal.png', roughness: 'l11-vertical-cinema_roughness.png',
    source: 'assets/l11-vertical-signs/manifest.json',
  },
] as const

export type L11VerticalSignId = typeof L11_VERTICAL_SIGNS[number]['id']
export function l11VerticalSign(id: string) {
  return L11_VERTICAL_SIGNS.find(sign => sign.id === id) ?? L11_VERTICAL_SIGNS[0]
}
