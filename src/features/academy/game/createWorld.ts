import { workshopReference } from './workshopModel';
import * as Phaser from 'phaser';
import { gameAsset } from './gameAsset';
import { hotspots, npcDetails, placeNpcs, type Interaction, type Npc, type Place, type WorldBridge } from './world';
import { BACKDROP_DEPTH, MOTE_DEPTH, actorDepth, perspectiveScale } from './worldDepth';

const W = 1536, H = 1024;
// 인물 자리 표는 worldActors.ts 로 옮겼다(2026-10-04 — 이야기 표식이 Phaser 없이 머리 위 자리를 계산하도록). 예전 이름으로도 내보낸다.
export { roomActors, extraActors } from './worldActors';
import { roomActors, extraActors } from './worldActors';
export function createWorld(parent: HTMLElement, initialPlace: Place, reducedMotion: boolean, onInteract: (id: Interaction) => void, onReady: () => void, onError: () => void, onProgress?: (value: number) => void): WorldBridge {
  let place = initialPlace, reduced = reducedMotion, locked = false, ready = false, moving = false;
  let player: Phaser.GameObjects.Container;
  let avatar: Phaser.GameObjects.Image;
  let walking: Phaser.Tweens.Tween | undefined;
  let bobbing: Phaser.Tweens.Tween | undefined;
  let world: Adventure;
  let outfit = { ...workshopReference };
  let extras: Partial<Record<Place, Npc[]>> = {};

  class Adventure extends Phaser.Scene {
    constructor() { super('academy'); }
    preload() {
      this.load.on('loaderror', (file: Phaser.Loader.File) => { if (!file.key.startsWith('https://')) onError(); });
      // 로딩 화면의 % (2026-10-04) — 장소·인물 원화를 받는 동안의 진행률(0~1).
      this.load.on('progress', (value: number) => onProgress?.(value));
      for (const key of ['plaza', 'library', 'observatory', 'post', 'dorm', 'dorm-rose', 'dorm-stars', 'ria-rose', 'luon-blue', 'luon-classic', 'ria-player', ...Object.values(npcDetails).map(n => n.asset)]) this.load.image(key, `/images/academy-game/${key}.png`);
    }
    create() {
      world = game.scene.getScene('academy') as Adventure;
      if (['plaza', 'library', 'observatory', 'post', 'dorm', 'dorm-rose', 'dorm-stars', 'ria-rose', 'luon-blue', 'luon-classic', 'ria-player', ...Object.values(npcDetails).map(n => n.asset)].some(k => !this.textures.exists(k))) return;
      this.paint();
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over?.length) return; // 인물 그림을 눌렀다 — 그림의 pointerdown 이 다가가 말을 건다
        if (locked || moving || pointer.y < H * .64) return;
        this.walk(Phaser.Math.Clamp(pointer.x, W * .12, W * .88), Phaser.Math.Clamp(pointer.y, H * .65, H * .88));
      });
      ready = true;
      this.loadOutfit();
      onReady();
    }
    /** 인물 그림을 누르면 그 인물의 핫스팟과 똑같이 — 걸어가서 말을 건다(2026-10-04 사용자 요청 «캐릭터를 클릭해도 INTERACTION»). */
    talkable(image: Phaser.GameObjects.Image, id: Npc) {
      const spot = hotspots[place].find(h => h.id === id);
      if (!spot) return;
      image.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(image.width * .22, image.height * .04, image.width * .56, image.height * .96), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
      image.on('pointerdown', () => { if (!ready || locked) return; this.walk(W * spot.walkX / 100, H * spot.walkY / 100, () => onInteract(id)); });
    }
    paint() {
      this.tweens.killAll();
      // ⚠️ removeAll(true) 의 인자는 «파괴»가 아니라 «콜백 건너뛰기»다 — 화면에서만 빠지고 객체는 살아 입력 목록에 남는다.
      // 인물 그림에 클릭을 단 뒤(talkable) 지나온 장소의 인물이 «보이지 않는데 눌리는» 자리로 쌓였다(2026-10-06 사용자 제보,
      // 탐침 scripts/academy-test/npc-hit-probe.mjs). 하나씩 destroy 해야 입력·트윈·메모리에서 함께 빠진다.
      for (const child of [...this.children.list]) child.destroy();
      for (const key of this.textures.getTextureKeys()) {
        if (key.startsWith('https://') && !Object.values(outfit).includes(key)) this.textures.remove(key);
      }
      const visibleOutfit = { ria: this.textures.exists(outfit.ria) ? outfit.ria : 'ria-player', luon: this.textures.exists(outfit.luon) ? outfit.luon : 'luon', room: this.textures.exists(outfit.room) ? outfit.room : 'dorm' };
      this.add.image(0, 0, place === 'dorm' ? visibleOutfit.room : place).setOrigin(0).setDisplaySize(W, H).setDepth(BACKDROP_DEPTH);
      // 인물은 모두 발 높이를 깊이로 쓴다 — 안쪽(위)에 선 사람이 뒤에 그려진다(worldDepth.ts).
      const { npcX, npcY, playerHeight, npcHeight } = roomActors[place];
      const npc = placeNpcs[place];
      if (npc) {
        this.add.ellipse(W * npcX, H * npcY, 180, 35, 0x22152d, .35).setDepth(actorDepth(H * npcY) - .5);
        const portrait = this.add.image(W * npcX, H * npcY, this.textures.exists((npc === 'lamplighter' ? 'lamplighter' : outfit[npc])) ? (npc === 'lamplighter' ? 'lamplighter' : outfit[npc]) : npcDetails[npc].asset).setOrigin(.5, 1).setDisplaySize(npcHeight * 2 / 3, npcHeight).setDepth(actorDepth(H * npcY));
        this.talkable(portrait, npc);
        if (!reduced) this.tweens.add({ targets: portrait, y: portrait.y - 5, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      for (const extra of extras[place] ?? []) {
        const spot = extraActors[place]?.[extra];
        const key = npcDetails[extra]?.asset;
        if (!spot || !key || !this.textures.exists(key) || extra === npc) continue;
        this.add.ellipse(W * spot.x, H * spot.y, 170, 33, 0x22152d, .35).setDepth(actorDepth(H * spot.y) - .5);
        const figure = this.add.image(W * spot.x, H * spot.y, key).setOrigin(.5, 1).setDisplaySize(spot.height * 2 / 3, spot.height).setFlipX(!!spot.flip).setDepth(actorDepth(H * spot.y));
        this.talkable(figure, extra);
        if (!reduced) this.tweens.add({ targets: figure, y: figure.y - 4, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      const shadow = this.add.ellipse(0, 0, 95, 19, 0x161123, .35);
      avatar = this.add.image(0, -8, visibleOutfit.ria).setOrigin(.5, 1).setDisplaySize(playerHeight * 2 / 3, playerHeight);
      player = this.add.container(W * (place === 'plaza' ? .36 : place === 'dorm' ? .49 : .24), H * .83, [shadow, avatar]);
      player.setScale(perspectiveScale(player.y, H)).setDepth(actorDepth(player.y));
      for (let i = 0; i < 30; i++) {
        const mote = this.add.circle(Phaser.Math.Between(70, W - 70), Phaser.Math.Between(170, H - 130), i % 3 === 0 ? 3 : 1.7, 0xffe1a3, .5).setDepth(MOTE_DEPTH);
        if (!reduced) this.tweens.add({ targets: mote, y: mote.y - 55, alpha: 0, duration: 3500 + i * 123, delay: i * 110, yoyo: true, repeat: -1 });
      }
      if (!reduced) this.cameras.main.fadeIn(450, 20, 15, 28);
      moving = false;
    }
    loadOutfit() {
      const missing = Object.values(outfit).filter(key => key.startsWith('https://') && !this.textures.exists(key));
      if (!missing.length) { this.paint(); return; }
      if (this.load.isLoading()) { this.load.once('complete', () => this.loadOutfit()); return; }
      for (const key of missing) this.load.image(key, gameAsset(key));
      this.load.once('complete', () => { if (ready) this.paint(); });
      this.load.start();
    }
    walk(x: number, y: number, arrived?: () => void) {
      walking?.stop(); bobbing?.stop();
      avatar.setAngle(0).setY(-8).setFlipX(x < player.x);
      const distance = Phaser.Math.Distance.Between(player.x, player.y, x, y);
      moving = true;
      if (!reduced) bobbing = this.tweens.add({ targets: avatar, y: -15, angle: 2, duration: 145, yoyo: true, repeat: -1 });
      // 걸음마다 크기와 그리는 순서를 함께 고친다 — NPC 뒤로 지나가면 NPC 가 앞을 가린다.
      const perspective = () => player.setScale(perspectiveScale(player.y, H)).setDepth(actorDepth(player.y));
      const finish = () => { bobbing?.stop(); avatar.setY(-8).setAngle(0); perspective(); moving = false; arrived?.(); };
      if (reduced) { player.setPosition(x, y); finish(); return; }
      walking = this.tweens.add({ targets: player, x, y, duration: Math.max(260, distance * 1.55), ease: 'Sine.easeInOut', onUpdate: perspective, onComplete: finish });
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: '#21172d',
    scene: Adventure, transparent: false, banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true }, audio: { noAudio: true },
  });
  /**
   * 캔버스 크기를 세계 평면에 다시 맞춘다 (2026-10-03 사용자 휴대폰 제보 — 홈에 다녀오거나 세로 → 가로로 돌리면
   * 캔버스가 예전(세로) 크기에 멈춰 가운데 작게 남고, 장소 단추(DOM)만 새 크기로 퍼져 서로 어긋났다).
   * Phaser 는 창 resize 이벤트 + 0.5초 점검으로 따라가는데, 휴대폰에서는 resize 가 화면 배치가 끝나기 전에 오고
   * 배경에서 돌아오는 동안 루프가 멈춰 있어 중간 크기에 멈출 수 있다(데스크톱 크롬으로는 재현되지 않았다 — 얼리기·숨기기 모의도 통과).
   * 그래서 평면의 «실제» 크기가 바뀌는 순간(ResizeObserver — 배치가 끝난 뒤 온다)과 돌아오는 순간에 직접 다시 잰다.
   */
  const refit = () => { if (game.isBooted && game.scale) { game.loop.wake?.(); game.scale.refresh(); } };
  let refitFrame = 0, refitTimer = 0;
  const scheduleRefit = () => {
    cancelAnimationFrame(refitFrame); window.clearTimeout(refitTimer);
    refitFrame = requestAnimationFrame(() => { refitFrame = requestAnimationFrame(refit); });
    refitTimer = window.setTimeout(refit, 400); // 주소창·상태 표시줄이 늦게 자리 잡는 경우
  };
  const sizeWatch = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleRefit) : null;
  sizeWatch?.observe(parent);
  const onVisible = () => { if (document.visibilityState === 'visible') scheduleRefit(); };
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('fullscreenchange', scheduleRefit);
  window.addEventListener('pageshow', scheduleRefit);
  window.addEventListener('orientationchange', scheduleRefit);
  screen.orientation?.addEventListener?.('change', scheduleRefit);
  const stopRefit = () => {
    sizeWatch?.disconnect(); cancelAnimationFrame(refitFrame); window.clearTimeout(refitTimer);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('fullscreenchange', scheduleRefit);
    window.removeEventListener('pageshow', scheduleRefit);
    window.removeEventListener('orientationchange', scheduleRefit);
    screen.orientation?.removeEventListener?.('change', scheduleRefit);
  };
  return {
    interact(id) {
      if (!ready || locked) return;
      const spot = hotspots[place].find(h => h.id === id);
      if (spot) world.walk(W * spot.walkX / 100, H * spot.walkY / 100, () => onInteract(id));
    },
    travel(next) {
      if (!ready || next === place) return;
      walking?.stop(); bobbing?.stop();
      place = next;
      world.paint();
    },
    pause(value) { locked = value; if (value && moving) { walking?.stop(); bobbing?.stop(); avatar.setAngle(0).setY(-8); moving = false; } },
    motion(value) { reduced = value; if (ready) world.paint(); },
    wardrobe(value) { outfit = value; if (ready) world.loadOutfit(); },
    actors(value) { extras = value; if (ready) world.paint(); },
    destroy() { ready = false; stopRefit(); game.destroy(true); },
  };
}
