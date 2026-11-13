"""제6장 추천 서가의 «학과별 추천» 시드 생성기 (2026-10-03).

출처 둘을 학과·계열 단위로 합친다:
  ① 고려대학교 도서관 «학과별 권장도서» — 학과가 직접 추천한 도서(18개 학과, 235권).
     수집: library.korea.ac.kr/datause/collection/by-dept/<단과대>/?deptcode=<학과>&pg=<n>
  ② 서울대 입학본부 웹진 아로리 «단과대학별 지원자가 가장 많이 읽은 책 3권»(2014~2022학년도 표).
     «추천»이 아니라 «지원자가 많이 읽은 책»이므로 화면(note)이 그렇게 말한다.
입력 = .tmp/book-data/ku-dept-books.json · arori-tables.json (수집 결과, gitignore)
출력 = supabase/migrations/20261003160000_academy_reading_major_shelf.sql
실행 = PYTHONIOENCODING=utf-8 python scripts/academy-reading-books/build-sql.py
"""
import json, re, collections

KU_FIELD = {'경영학과': '경영경제', '화공생명공학과': '공학', '국제학부': '사회', '글로벌한국융합학부': '인문', '디자인조형학부': '예체능',
            '사회학과': '사회', '한문학과': '인문', '한국사학과': '인문', '철학과': '인문', '지리교육과': '교육', '역사교육과': '교육', '영어교육과': '교육',
            '생명과학부': '자연', '수학과': '자연', '화학과': '자연', '정치외교학과': '사회', '컴퓨터학과': '공학', '데이터과학과': '공학'}
# 자유전공학부는 계열이 없어 뺀다.
SNU_FIELD = {'인문대학': '인문', '사회과학대학': '사회', '자연과학대학': '자연', '간호대학': '의약보건', '경영대학': '경영경제', '공과대학': '공학',
             '농업생명과학대학': '자연', '미술대학': '예체능', '사범대학': '교육', '생활과학대학': '사회', '수의과대학': '의약보건',
             '음악대학': '예체능', '의과대학': '의약보건', '치의학대학원': '의약보건', '약학대학': '의약보건'}
SNU_NAME = {'농생명과학대학': '농업생명과학대학'}
FIX = {'아프니깐 청춘이다': '아프니까 청춘이다', '나는 간호사 사람입니다': '나는 간호사, 사람입니다', '숨결이 바람될 때': '숨결이 바람 될 때',
       '하노버에서 온 음악편지': '하노버에서 온 음악 편지', '동물해방': '동물 해방', '이상한 정상 가족': '이상한 정상가족',
       '생명이 있는 것은 아름답다': '생명이 있는 것은 다 아름답다', '트렌드 코리아 2016': '트렌드 코리아',
       '파타고니아 , 파도가 칠 때는 서핑을': '파타고니아, 파도가 칠 때는 서핑을'}
# 아로리 표에는 저자가 없다 — 확실한 것만 적고 모르면 비워 둔다.
AUTHOR = {'넛지': '리처드 탈러, 캐스 선스타인', '경영학 콘서트': '장영재', '에밀': '장 자크 루소', '수레바퀴 아래서': '헤르만 헤세', '평균의 종말': '토드 로즈',
          '군주론': '니콜로 마키아벨리', '나쁜 사마리아인들': '장하준', '공정하다는 착각': '마이클 샌델', '선량한 차별주의자': '김지혜', '이상한 정상가족': '김희경',
          '소비의 사회': '장 보드리야르', '딥스': '버지니아 M. 액슬린', '동물 해방': '피터 싱어', '닥터스 씽킹': '제롬 그루프먼', '아내를 모자로 착각한 남자': '올리버 색스',
          '숨결이 바람 될 때': '폴 칼라니티', '아픔이 길이 되려면': '김승섭', '이중나선': '제임스 왓슨', '코스모스': '칼 세이건', '페르마의 마지막 정리': '사이먼 싱',
          '학문의 즐거움': '히로나카 헤이스케', '디자인의 디자인': '하라 켄야', '생각의 탄생': '로버트 루트번스타인, 미셸 루트번스타인', '달과 6펜스': '서머싯 몸',
          '연금술사': '파울로 코엘료', '변신': '프란츠 카프카', '인간을 위한 디자인': '빅터 파파넥', '자유론': '존 스튜어트 밀', '팩트풀니스': '한스 로슬링 외',
          '사피엔스': '유발 하라리', '논어': '공자', '역사란 무엇인가': 'E. H. 카', '1984': '조지 오웰', '데미안': '헤르만 헤세', '멋진 신세계': '올더스 헉슬리',
          '침묵의 봄': '레이첼 카슨', '부분과 전체': '베르너 하이젠베르크', '이기적 유전자': '리처드 도킨스', '엔트로피': '제레미 리프킨', '정의란 무엇인가': '마이클 샌델',
          '돈으로 살 수 없는 것들': '마이클 샌델', '왜 세계의 절반은 굶주리는가': '장 지글러', '미움받을 용기': '기시미 이치로, 고가 후미타케', '아프니까 청춘이다': '김난도',
          '페스트': '알베르 카뮈', '오래된 미래': '헬레나 노르베리 호지', '꿈꾸는 다락방': '김하준', '어떻게 원하는 것을 얻는가': '스튜어트 다이아몬드',
          '죽은 경제학자의 살아있는 아이디어': '토드 부크홀츠', '죽은 시인의 사회': 'N. H. 클라인바움', '교사와 학생 사이': '하임 G. 기너트',
          '파타고니아, 파도가 칠 때는 서핑을': '이본 쉬나드', '트렌드 코리아': '김난도 외', '광고천재 이제석': '이제석', '시골의사의 아름다운 동행': '박경철',
          '나는 내일을 기다리지 않는다': '강수진', '자존감 수업': '윤홍균'}
FIELDS = ['인문', '사회', '경영경제', '교육', '자연', '공학', '의약보건', '예체능']

HANGUL = re.compile('[가-힣]')


def q(v):
    return 'null' if v is None else "'" + v.replace("'", "''") + "'"


def person(a):
    """고려대 목록의 «Grant, Adam» → «Adam Grant». 한글·한자 이름은 그대로."""
    if not a:
        return None
    a = re.sub(r',?\s*\d{4}-?(\d{4})?', '', a).strip(' ,')
    m = re.fullmatch(r"([A-Za-zÀ-ÿ'\-]+),\s*([A-Za-zÀ-ÿ.'\-\s]+)", a)
    return f'{m.group(2).strip()} {m.group(1)}' if m else a


rows = []  # (field, department, sort, title, author, note, source)
ku = json.load(open('.tmp/book-data/ku-dept-books.json', encoding='utf-8'))
seen, per_dept, dropped = set(), collections.Counter(), 0
for b in ku:
    t = re.sub(r'\[electronic resource\]', '', b['title'], flags=re.I)
    t = re.split(r'\s/\s', t)[0].strip()
    if not HANGUL.search(t):
        dropped += 1  # 원서는 뺀다 — 고등학생 서가
        continue
    main, _, sub = t.partition(' : ')
    main, sub = main.strip(), (sub.strip() or None)
    if (b['dept'], main) in seen:
        continue
    seen.add((b['dept'], main))
    per_dept[b['dept']] += 1
    rows.append((KU_FIELD[b['dept']], f"고려대 {b['dept']}", per_dept[b['dept']], main, person(b['author']), sub,
                 '고려대학교 도서관 학과별 권장도서'))

tables = json.load(open('.tmp/book-data/arori-tables.json', encoding='utf-8'))
per, best = collections.defaultdict(collections.Counter), collections.defaultdict(dict)
for year, tabs in tables.items():
    for tab in tabs:
        if not tab or tab[0][0] != '단과대학':
            continue
        for r in tab[1:]:
            col = SNU_NAME.get(r[0], r[0])
            if col not in SNU_FIELD:
                continue
            for rank, cell in enumerate(r[1:], 1):
                for title in (c.strip() for c in cell.split(' / ')):  # 공동 3위는 «A / B»
                    title = FIX.get(title, title)
                    per[col][title] += 1
                    best[col][title] = min(best[col].get(title, 9), rank)
for col, counts in per.items():
    for i, title in enumerate(sorted(counts, key=lambda k: (-counts[k], best[col][k], k)), 1):
        n = counts[title]
        rows.append((SNU_FIELD[col], f'서울대 {col}', i, title, AUTHOR.get(title),
                     f'지원자가 가장 많이 읽은 책 3권에 {n}번 든 책' if n > 1 else '지원자가 가장 많이 읽은 책 3권에 든 책',
                     '서울대 입학본부 웹진 아로리 · 단과대학별 지원자가 가장 많이 읽은 책(2014~2022학년도)'))

out = [
    "-- 제6장 추천 서가에 «학과별 추천» 칸을 더한다 (2026-10-03 사용자 요청: «과별로 읽으면 좋은 도서»).",
    "-- 생성 = scripts/academy-reading-books/build-sql.py (출처·정규화 규칙은 그 파일 머리말). 손으로 고치지 말 것.",
    "begin;",
    "alter table public.academy_book_recommendations add column if not exists shelf text not null default 'classic';",
    "alter table public.academy_book_recommendations add column if not exists department text check (department is null or char_length(department) <= 60);",
    "alter table public.academy_book_recommendations drop constraint if exists academy_book_recommendations_field_check;",
    "alter table public.academy_book_recommendations drop constraint if exists academy_book_recommendations_shelf_field_check;",
    "alter table public.academy_book_recommendations add constraint academy_book_recommendations_shelf_field_check check (",
    "  (shelf = 'classic' and field in ('과학기술','동양사상','서양사상','외국문학','한국문학') and department is null)",
    "  or (shelf = 'major' and field in (" + ','.join(q(f) for f in FIELDS) + ") and department is not null));",
    "drop index if exists public.academy_book_recommendations_title_idx;",
    "create unique index academy_book_recommendations_title_idx on public.academy_book_recommendations(shelf, field, coalesce(department, ''), title);",
    "delete from public.academy_book_recommendations where shelf = 'major';",
    "insert into public.academy_book_recommendations(shelf, field, department, sort, title, author, note, source) values",
]
out.append(',\n'.join(f" ('major',{q(f)},{q(d)},{s},{q(t[:200])},{q(a[:120] if a else None)},{q(n[:500] if n else None)},{q(src)})"
                      for f, d, s, t, a, n, src in rows) + ';')
out.append('commit;')
open('supabase/migrations/20261003160000_academy_reading_major_shelf.sql', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('rows', len(rows), '| 원서 제외', dropped)
print(dict(collections.Counter(r[0] for r in rows)))
print(len(set(r[1] for r in rows)), 'departments')
