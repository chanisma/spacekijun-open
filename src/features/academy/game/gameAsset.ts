export function gameAsset(asset: string) {
  return asset.startsWith('https://') ? asset : `/images/academy-game/${asset}.png`;
}
