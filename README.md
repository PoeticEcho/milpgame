# 🚁 MILP 군집 무인기 최적 지휘 시뮬레이터
초등 고학년 및 중학생 대상 **정보올림피아드(KOI) 및 프로그래밍 경시대회 알고리즘 교육용 웹 시뮬레이터**입니다. 수학계의 대표적인 난제인 '외판원 문제(TSP)'와 '배낭 문제(Knapsack)'를 게임처럼 즐기며, 혼합 정수 선형 계획법(MILP)과 동적 계획법(DP)의 원리를 직관적으로 학습할 수 있습니다.
## ✨ 주요 기능 및 특징
 * **🚀 AI 자동 시뮬레이터 (AUTO MODE)**
   * 표적 개수와 드론 연료 한계를 조절하며 수만 가지 경우의 수를 계산해내는 AI의 최적화 과정을 실시간으로 확인합니다.
 * **📖 비밀 노트 (이론 및 한계 극복)**
   * 왜 드론 편대 비행이 어려운지(TSP, 배낭 문제의 현실적 한계) 알아보고, 이를 수학적 방정식(MILP)으로 돌파하는 원리를 배웁니다.
 * **💻 해커의 방 (알고리즘 코드 분석)**
   * 실제 대회에서 쓰이는 '동적 계획법(DP)'과 '비트마스킹(Bitmasking)'을 활용한 Javascript 최적해 탐색 코드를 분석합니다.
 * **🎮 인간 vs AI 대결 (CHALLENGE MODE)**
   * 레이더 캔버스 위에서 사용자가 직접 두 대의 드론(알파, 브라보) 경로를 그려보고, AI가 도출한 최적의 정답과 획득 가치, 소요 시간을 시각적으로 비교 분석합니다.
## 🛠 기술 스택
 * **Frontend:** React (Hooks), Tailwind CSS
 * **Algorithm:** Dynamic Programming, Bitmasking (Time Complexity: O(N^2 \cdot 2^N))
 * **Deployment:** Vite
## 🚀 로컬 실행 방법 (How to run)
 1. 저장소를 클론(Clone)합니다.
   ```bash
   git clone [https://github.com/your-username/milp-uav-simulator.git](https://github.com/your-username/milp-uav-simulator.git)
   
   ```
 2. 프로젝트 디렉토리로 이동하여 의존성 패키지를 설치합니다.
   ```bash
   cd milp-uav-simulator
   npm install
   
   ```
 3. public 폴더 내에 배경음악 파일(find_the_apex.mp3)이 포함되어 있는지 확인합니다.
 4. 개발 서버를 실행합니다.
   ```bash
   npm run dev
   
   ```
## 🧠 알고리즘 핵심 원리
이 시뮬레이터는 웹 브라우저 환경에서 MILP를 모사하기 위해 다음과 같은 로직으로 구현되었습니다.
 1. **거리 행렬 캐싱 (Distance Matrix):** 모든 노드 간의 거리를 미리 계산하여 연산 속도 최적화
 2. **TSP 최단 경로 탐색:** 비트마스킹(1 << N)과 메모이제이션(DP)을 활용하여 모든 표적 부분집합에 대한 최단 귀환 거리를 도출
 3. **Knapsack 분배 (다중 목적 최적화):** 두 무인기의 연료 한계(Max Fuel)를 초과하지 않고 서로 교집합이 없는 상태에서 **1순위: 가치(Value) 최대화, 2순위: 거리(Distance) 최소화** 조건에 맞는 글로벌 최적해 탐색
