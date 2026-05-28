# MILP Drone Simulation App

제약조건 속에서 최적 조합을 찾는 과정을 시각적으로 보여주는 **MILP 기반 드론 경로 시뮬레이션 앱**입니다. 드론 편대가 제한된 연료 안에서 표적을 어떻게 배분하고 이동해야 가장 높은 가치를 얻을 수 있는지, 인간의 선택과 알고리즘의 최적해를 비교할 수 있습니다.

## Features

- React + Vite + TypeScript 기반 웹앱
- Tailwind CSS 기반 UI
- 인간 vs AI 경로 선택 체험 모드
- DP + 비트마스킹 방식의 MILP 유사 최적화 시뮬레이션
- GitHub / Vercel 배포용 기본 구조 포함

## Project Structure

```text
milp-simulation-app/
├─ public/
│  └─ README_BGM.txt
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ index.css
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.cjs
├─ postcss.config.cjs
├─ tsconfig.json
├─ vercel.json
├─ .gitignore
├─ LICENSE
└─ README.md
```

## Local Development

```bash
npm install
npm run dev
```

## Build Test

```bash
npm run build
npm run preview
```

## Vercel Deployment

1. GitHub에 이 프로젝트 폴더 전체를 업로드합니다.
2. Vercel에서 **Add New Project**를 누릅니다.
3. GitHub 저장소를 선택합니다.
4. 아래 설정을 확인합니다.

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

5. Deploy를 누르면 `프로젝트명.vercel.app` 주소로 배포됩니다.

## Background Music

앱 코드에는 배경음악 경로가 `/find_the_apex.mp3`로 설정되어 있습니다.

배경음악을 사용하려면 MP3 파일을 아래 위치에 넣어주세요.

```text
public/find_the_apex.mp3
```

MP3 파일을 넣지 않아도 앱은 실행됩니다. 다만 BGM 버튼은 음악을 재생하지 못합니다.

## License

This project is licensed under the GNU General Public License v3.0. See `LICENSE` for details.
