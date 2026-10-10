# 텐 (@TENten10_1) 자기소개 페이지

GitHub Pages로 올리고, Firebase(구글 로그인 + Firestore)로 내용을 수정하는 정적 페이지예요.
편집은 `e.eam8090@gmail.com` 계정으로 로그인했을 때만 가능해요.

```
index.html          페이지 뼈대
style.css           디자인
js/app.js           화면, 로그인, 편집 기능
js/default-data.js  저장된 내용이 없을 때 보여줄 기본 내용
js/firebase-config.js  Firebase 설정값 (직접 채워야 해요)
firestore.rules     Firestore 보안 규칙
```

## 1. Firebase 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com)에서 **프로젝트 추가**
2. 프로젝트 설정(톱니바퀴) > **내 앱** > 웹 앱(`</>`) 추가 (Firebase Hosting 설정은 체크 안 해도 돼요)
3. 화면에 나온 `firebaseConfig` 값을 `js/firebase-config.js` 에 붙여넣기

## 2. 로그인 켜기

1. **Authentication** > 시작하기 > **로그인 방법** > **Google** 사용 설정 (지원 이메일 선택)
2. **Authentication > 설정 > 승인된 도메인** 에 GitHub Pages 주소 추가
   - 예: `내아이디.github.io` (경로는 빼고 도메인만 적어요)
   - `localhost` 는 기본으로 들어 있어요

## 3. Firestore 만들고 규칙 배포하기

1. **Firestore Database** > 데이터베이스 만들기 (프로덕션 모드, 가까운 리전 선택)
2. **규칙** 탭에 `firestore.rules` 내용을 통째로 붙여넣고 **게시**
   - 터미널을 쓴다면 `firebase deploy --only firestore:rules` 로도 배포할 수 있어요.

규칙이 하는 일은 이래요.

- `profile` 문서는 누구나 읽을 수 있어요.
- 쓰기는 구글 로그인한 `e.eam8090@gmail.com` (이메일 인증됨) 만 가능하고, 삭제는 아무도 못 해요.
- 저장되는 필드와 길이도 제한해요. 그 밖의 모든 경로는 막혀 있어요.

## 4. GitHub에 올리기

1. 이 폴더의 파일을 저장소에 올리기 (`firebase-config.js` 는 값을 채운 상태로)
2. 저장소 **Settings > Pages** > Source를 `Deploy from a branch`, 브랜치 `main`, 폴더 `/ (root)` 로 선택
3. 몇 분 뒤 `https://내아이디.github.io/저장소이름/` 에서 열려요.

## 5. 사용하기

1. 페이지 오른쪽 아래 **관리자 로그인** > 구글 계정 선택
2. 편집 계정이면 **✎ 편집** 버튼이 나타나요. 눌러서 고치고 **저장하기**
3. 처음 저장하면 Firestore에 `profile/main` 문서가 만들어져요.

다른 구글 계정으로 로그인하면 바로 로그아웃되고, 규칙 때문에 저장도 되지 않아요.

## 알아두면 좋은 점

- `apiKey` 등 설정값은 공개 저장소에 올라가도 괜찮아요. 접근은 규칙이 막아줘요.
- 이메일 대신 계정 고유 ID(UID)로 제한하고 싶다면, 로그인한 뒤 Firebase 콘솔 Authentication 에서 UID를 확인해서 `firestore.rules` 의 `isOwner()` 를 `request.auth.uid == '내UID'` 로 바꾸면 돼요.
- 파일을 더블클릭(file://)으로 열면 모듈 불러오기가 막혀요. 로컬에서 보려면 `npx serve` 같은 간단한 서버를 쓰거나 바로 GitHub에 올려서 확인해 주세요.
- Firebase 설정값을 채우기 전에는 로그인 버튼 없이 기본 내용만 보여줘요.
