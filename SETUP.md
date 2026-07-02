# Paper Notes 설치 가이드

이 앱은 빌드 과정 없이 정적 파일(HTML/CSS/JS) + Supabase(DB+로그인)로 동작합니다.
아래 순서대로 한 번만 설정하면 됩니다.

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 가입/로그인
2. "New project" 클릭 → 무료(Free) 플랜 선택, 이름 아무거나, DB 비밀번호는 아무거나 정해서 기록해두기(앱에서는 직접 쓰지 않음), 리전은 가까운 곳(Northeast Asia 등)
3. 생성 완료까지 1~2분 대기

## 2. 테이블 만들기
1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 폴더의 [supabase_schema.sql](supabase_schema.sql) 내용을 전부 복사해서 붙여넣고 **Run**
3. `papers`, `quotes` 테이블과 보안 정책(RLS)이 생성됩니다

## 3. API 키를 앱에 연결
1. 왼쪽 메뉴 **Project Settings → API**
2. **Project URL** 과 **anon public** 키를 복사
3. 이 폴더의 `config.example.js`를 복사해서 `config.js` 파일을 만들고 두 값을 채워 넣기
   (`config.js`는 배포 시에도 그대로 포함되어야 합니다 — anon 키는 공개되어도 안전하도록 설계되어 있고, 실제 보안은 2단계에서 만든 RLS 정책이 담당합니다)

## 4. 로컬에서 확인
Claude에게 로컬 서버 실행 및 확인을 요청하면 `serve.ps1`로 미리보기할 수 있습니다.

## 5. 내 계정 1개 만들기
1. 로그인 화면에서 "회원가입" 클릭 → 본인 이메일/비밀번호로 가입
2. 기본 설정상 이메일 인증이 필요할 수 있습니다. 받은 메일의 링크를 눌러야 로그인됩니다.
   - 번거로우면 Supabase 대시보드 **Authentication → Providers → Email**에서 **Confirm email**을 꺼서 인증 없이 바로 로그인되게 할 수 있습니다 (혼자 쓰는 앱이라 꺼도 무방)
3. 가입이 끝나면 **Authentication → Settings**(또는 Providers 화면)에서 **Allow new users to sign up**을 꺼주세요.
   → 이후로는 앱 주소를 아는 사람이 있어도 새로 가입할 수 없습니다. 본인 계정으로만 로그인 가능합니다.

## 6. GitHub Pages로 배포 (어떤 컴퓨터에서든 접속)
1. GitHub에 새 저장소 생성 (Pages 무료 사용을 위해 Public)
2. 이 폴더를 그 저장소로 push
3. 저장소 **Settings → Pages** → Source를 "Deploy from a branch", Branch를 `main`/`(root)`로 설정 후 저장
4. 몇 분 뒤 `https://<계정명>.github.io/<저장소명>/` 주소로 접속 가능

## 참고
- 데이터(논문/인용문)는 전부 Supabase에 저장되므로, 코드를 다시 배포해도 데이터는 그대로 유지됩니다.
- 화면(코드)은 공개 저장소라 누구나 볼 수 있지만, 로그인 없이는 데이터가 전혀 보이지 않고, 로그인도 본인 계정만 가능하도록 막아뒀습니다(5번 참고).
