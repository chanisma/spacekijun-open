import type { WorkshopSlot } from './workshopModel';

export async function validateWorkshopImage(file: File, slot: WorkshopSlot) {
  if (file.type !== 'image/png' || file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 PNG 파일을 선택해 주세요.');
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if ([137,80,78,71,13,10,26,10].some((v, i) => signature[i] !== v)) throw new Error('실제 PNG 이미지가 필요합니다.');
  const bitmap = await createImageBitmap(file);
  try {
    const target = slot === 'room' ? 1.5 : 2 / 3;
    if (bitmap.width < 256 || bitmap.height < 256 || bitmap.width > 4096 || bitmap.height > 4096 || Math.abs(bitmap.width / bitmap.height - target) > .03) throw new Error(slot === 'room' ? '방은 가로 3:2 비율(권장 1536×1024)로 제작해 주세요.' : '의상은 세로 2:3 비율(권장 1024×1536)로 제작해 주세요.');
    if (slot !== 'room') {
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 150;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이미지 투명도를 확인할 수 없습니다.');
      context.drawImage(bitmap, 0, 0, 100, 150);
      const rgba = context.getImageData(0, 0, 100, 150).data;
      let clear = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 16) clear++;
      if (clear < 150 || [0, 99, 14900, 14999].some(i => rgba[i * 4 + 3] > 16)) throw new Error('의상 배경이 투명하지 않습니다. 체크무늬가 아닌 실제 알파 투명 PNG를 등록해 주세요.');
    }
  } finally { bitmap.close(); }
}
