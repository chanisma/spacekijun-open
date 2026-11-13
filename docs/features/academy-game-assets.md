# 별빛 아카데미 게임 에셋

2026-09-13. **built-in imagegen**으로 로맨스 판타지 배경과 캐릭터 PNG를 제작했다. 외부 이미지 팩/유료 음원은 사용하지 않았다. 전체 프롬프트 및 최종 교체 이력은 `public/images/academy-game/manifest-v2.json`, 최초 광장·도서관 배경은 `manifest.json`에 기록한다.

| 파일 | 규격 | 현재 용도 |
| --- | --- | --- |
| plaza.png | 1536×1024 RGB | 중앙 광장 배경 |
| library.png | 1536×1024 RGB | 왕립 도서관 배경 |
| observatory.png | 1536×1024 RGB | 망원경·연구대·교수 좌석이 있는 연구시설 |
| post.png | 1536×1024 RGB | 전서구·편지함·관측 일지 책상이 있는 우편국 |
| ria-player.png | 1024×1536 RGBA | 여성 플레이어 리아, 갈색 머리·보라색 의상 |
| luon.png | 1024×1536 RGBA | 남성 안내자 루온 |
| librarian-male.png | 1024×1536 RGBA | 남성 사서 엘리안 |
| professor.png | 1024×1536 RGBA | 남성 교수 카시안 |
| postmaster.png | 1024×1536 RGBA | 남성 배달부 노엘 |

캐릭터 5종 모두 실제 알파 채널을 검사했다. 16픽셀 간격 표본에서 완전 투명 픽셀/불투명 픽셀을 모두 확인했고 게임 배경 위에 합성된 스크린샷도 확인했다. 체크무늬가 이미지에 그려진 중간 결과는 사용하지 않는다. 리아·루온·교수는 반복 편집 대신 최종 독립 생성으로 투명도를 확보했고, 사서는 투명도 편집 결과, 노엘은 최초 투명 생성 결과를 사용한다. 원본 생성 파일은 생성 도구 폴더에도 보존했다.

이전 시안 `ria.png`, `librarian.png`, `traveler.png`는 현재 게임에서 참조하지 않는다. 특히 예전 여성 NPC 초상을 현재 사서로 사용하지 않는다. 최종 캐릭터 이름·성별·파일의 매핑은 `game/world.ts`에 있다.

루온의 외형 오류를 원본 `public/images/world-today/academy-observers.png`와 비교해 수정했다. 최종 스프라이트를 새로 만드는 과정에서 은발·푸른 눈이 갈색 머리·보라색 눈으로 바뀌어 있었다. `luon.png`, `luon-blue.png`, `prologue-arrival.png`, `prologue-notebook.png` 네 장을 원본의 은백색 머리·푸른 눈에 맞췄다. 리아의 외형과 각 장면 행동은 유지한다. 스프라이트 두 장은 사용자 승인된 로컬 MODNet으로 실제 알파를 확보하고 전체 RGB 보존, 얼굴 불투명, 모서리 투명을 검사했다. 수정 프롬프트·생성 원본·처리 이력은 `manifest-luon-identity.json`에, 예복과 프롤로그의 이전 원본 경로는 각 기존 manifest의 `previous_source`에 남겼다.

배경과 문자를 분리한다. 실제 기사·활동명·본문·선택지는 React 텍스트이며 원화에 구워 넣지 않는다. 책·종이·편지 봉투·인장·표식은 CSS/기본 도형, 지식 별자리는 기존 `InquiryGraphCanvas`의 Cytoscape 렌더러와 별자리 테마다. 이동/빛 입자/장소 전환은 Phaser, 책·망원경·전서구 진입은 CSS 애니메이션을 사용한다. 효과음은 사용자 선택 후 Web Audio로 합성한다.

장면 좌표 1536×1024 기준 리아/NPC 원화 높이는 광장 285/360, 도서관 310/395, 연구시설 330/420, 우편국 335/430이다. 리아는 남성 NPC의 약 78~79% 높이로 표시한다. `game/createWorld.ts`의 `roomActors`에서 발 위치와 함께 조정한다. 원화의 2:3 종횡비를 유지하고 대화용 원화 크기는 장면 크기에 반응하는 별도 CSS로 관리한다. 대화 시 탐험 원화를 숨겨 같은 인물이 중복되지 않는다. NPC 대화 버튼은 발치 아래에 배치해 얼굴과 몸을 가리지 않는다.

## 함께 행동하는 일러스트와 연구대

세 장 모두 built-in imagegen으로 생성해 `public/images/academy-game/`에 저장했다. 기존 리아·남성 NPC·방 배경을 외형과 화풍 참고 이미지로 사용했다. 프롬프트 전문, 원본 경로와 참고 파일은 [manifest-actions.json](../../public/images/academy-game/manifest-actions.json)에 기록한다. 최종 파일은 불투명 배경을 포함한 1536×1024 PNG다.

| 파일 | 최종 장면 / 프롬프트 요약 |
| --- | --- |
| ria-telescope-assisted.png | 작은 체격의 리아가 망원경을 직접 관측하고, 키가 큰 카시안이 곁에서 망원경 조절을 돕는 장면 |
| ria-reading-assisted.png | 리아가 책 표지와 첫 장을 직접 펼치고, 엘리안이 옆에서 페이지를 짚어 안내하는 장면 |
| research-desk.png | 별자리 지도 위 왼쪽 설계지, 오른쪽 보라색 연구 수첩을 별도 오브젝트로 둔 연구대 근접 배경 |

두 동작 그림은 이미지 로드 뒤 짧게 표시한 후 실제 KG 또는 책으로 넘어간다. 건너뛰기·Escape 취소와 동작 줄이기를 지원한다. 동영상이나 관절 애니메이션이 아니라 동작 일러스트에 화면 전환 효과를 적용한 것이다. 연구대 그림의 종이/수첩 위치에는 키보드 접근 가능한 버튼을 겹치며 제목을 원화에 구워 넣지 않는다. 초기의 리아 단독 망원경 시안은 최종 게임에서 사용하지 않는다.

단일 원화를 이동·흔들림 처리하는 방식이므로 관절 리깅·방향별 걷기 프레임은 포함하지 않는다. 현재 전체 배경/캐릭터를 첫 게임 진입 시 로드한다. 기기/네트워크에 따른 로딩 시간을 줄이는 화면별 로딩 및 배포 인코딩 최적화는 별도 후속 작업이다.


## 프롤로그와 기숙사 에셋

프롤로그는 `prologue-school`, `prologue-door`, `prologue-threshold`, `prologue-arrival`, `prologue-notebook`의 전용 PNG 5장과 기존 `plaza.png`를 사용한다. 31개 대사 동안 여섯 구간으로 전환한다. 전용 원화는 1536×1024이며 마지막에는 리아가 수첩에 적고 루온이 등불로 돕는다. 전체 프롬프트·참고 이미지·생성 원본 경로: `public/images/academy-game/manifest-prologue.json`.

기숙사는 같은 배치의 `dorm.png`, `dorm-rose.png`, `dorm-stars.png` 3장(1536×1024)을 쓴다. 기숙사 기본 화면에는 리아만 표시한다. 루온은 의상 분류를 고른 경우에만 착용 미리보기에 나타난다. 의상 미리보기 높이는 리아 72% / 루온 90%로 조절했다. 얼굴/의상/가구 미리보기는 원화 위 게임 UI에서 표현한다. 전체 생성 프롬프트는 `manifest-dormitory.json`에 있다.

중앙 광장 `plaza.png`를 네 시설이 분리되는 구도로 다시 생성했다. 왼쪽부터 책 문장의 도서관, 달 문장과 발코니가 있는 기숙사, 망원경 돔의 연구시설, 전서구와 편지 문장의 우편국이다. 각 입구로 이동 표식을 재배치했으며 루온 대화 표식은 인물 아래에 유지한다. 타이틀과 프롤로그의 광장 장면도 같은 새 배경을 사용한다. 프롬프트·원본 경로: `manifest-plaza-v2.json`.

**의상 최종 처리 완료:** `ria-rose.png`, `luon-blue.png`는 얼굴을 유지한 imagegen 편집본에 사용자 승인으로 로컬 알파 처리를 적용한 1024×1536 RGBA PNG다. [MODNet 모델](https://huggingface.co/Xenova/modnet)을 기존 Transformers.js로 로컬 실행해 마스크를 추론했다. 체크무늬 가장자리를 줄이기 위해 알파만 1픽셀 축소하고 임계값 8/247로 정리했다. RGB는 생성 원본의 모든 픽셀을 그대로 보존했다. 원본은 manifest의 source 경로에 남아 있다.

재현: `node scripts/academy-test/prepare-outfit-alpha.mjs`는 임시 폴더에 후보 이미지를 만들며 public 파일을 직접 덮어쓰지 않는다. 검수 후 복사한 최종 파일은 `node scripts/academy-test/verify-outfit-alpha.mjs`로 확인한다. 리아의 완전 투명/불투명/중간 알파 픽셀은 744,829 / 784,328 / 43,707개, 루온은 1,155,592 / 398,001 / 19,271개다. 전체 RGB 동일, 얼굴 내부 완전 불투명, 네 모서리 완전 투명 검사 및 게임 배경 합성·모바일 상점·착용 유지 브라우저 검사를 통과했다. 독립 생성한 리아 시안은 얼굴이 달라 사용하지 않았다. 새로운 패키지 설치나 이미지를 외부 서버로 보내는 처리는 없다.

## 구매 가능한 이전 루온

`luon-classic.png`는 커밋 `5d76150d11a3d082c90337ab25fa2d0a8c6b3d0e`의 `public/images/academy-game/luon.png`를 복원한 갈색 머리 루온이다. 재생성하지 않고 기존 승인된 MODNet 알파 처리만 적용했다. 1024×1536 RGBA, 전체 RGB 동일, 얼굴 내부 불투명, 네 모서리 투명 검증 통과. 완전 투명/불투명/부분 투명 픽셀: 1,151,085 / 387,265 / 34,514. 원본 복원 경로와 처리 정보는 `manifest-luon-classic.json`에 기록한다. `luon` 기본값을 교체하지 않고 카탈로그·프리로드·장착 허용 목록에 별도 등록한다.

세린(여성 룸메이트) 원화 `serin.png` 추가. 꿀빛 금발 땋은 머리, 세이지 눈과 치마, 아이보리 상의, 수첩을 든 다정한 표정. 기본 방에서 리아와 나란히 표시하고 대화에서는 여성 인물 크기로 조절한다. built-in image_gen 프롬프트/출처/알파 처리 정보는 `manifest-roommate.json` 및 `academy-roommate.md` 참조.

제1장 입장 삽화 `chapter-observatory-arrival.png`: 1536×1024, 리아·루온·observatory 기존 원화를 참조한 built-in imagegen 생성. 연구시설의 돔과 망원경을 보며 놀라는 리아를 중심으로 키가 큰 은발 루온이 곁에서 소개한다. 배경이 포함된 불투명 CG이며 UI나 글자는 없다. 프로젝트에 복사한 원본이며 이미지 후처리를 하지 않았다. 챕터 3번 책갈피에서 표시한다. 고정 삽화는 기본 의상, 일반 대화 초상은 장착 외형을 사용한다.

제1장 완료 `chapter-first-star-complete.png`, 제2장 도서관 전경 `chapter-library-arrival.png`, 책장 발견 `chapter-library-shelves.png`를 내장 imagegen으로 생성하여 추가했다. 기존 리아·루온(완료 장면은 카시안 포함)의 얼굴과 기본 의상/로판 분위기를 유지한다. 생성 프롬프트와 참고 이미지는 `manifest-chapter-completion.json`, `manifest-library-chapter.json`에 기록했다.
# 제3장 기숙사 CG

내장 image_gen으로 생성한 `chapter-dorm-hall.png`, `chapter-dorm-planning.png`, `chapter-dorm-night.png`를 `public/images/academy-game/`에 추가했다. 각각 세린과의 첫 만남, 리아가 계획장을 쓰고 선배가 곁에서 격려하는 모습, 침대에서 하루를 회상하는 모습이다. 기존 리아/세린 얼굴과 기숙사 장식을 참고했다. 전체 프롬프트와 자산 목록은 같은 경로의 `manifest-dorm-chapter.json`에 보관한다. 원본 이미지는 교체하지 않았다.

## 제4장 우편국 CG

내장 image_gen으로 기존 리아·루온·노엘·공간 원화를 참조해 `chapter-post-morning`, `chapter-post-arrival`, `chapter-post-letter`, `chapter-post-complete` PNG 네 장을 추가했다. 모두 1536×1024이며 게임 화면 전체를 채운다. 원화와 최종 프롬프트는 `public/images/academy-game/manifest-post-chapter.json`, 장면 배치는 [제4장 문서](academy-post-chapter.md)에 있다.
