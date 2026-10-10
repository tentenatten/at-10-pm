// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 에서 복사한 값으로 바꿔주세요.
// 이 값들은 공개돼도 괜찮아요. 실제 보안은 firestore.rules 가 지켜줘요.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 편집할 수 있는 계정 (firestore.rules 의 이메일과 같아야 해요)
export const OWNER_EMAIL = "e.eam8090@gmail.com";

// 위 값을 채우기 전에는 기본 내용만 보여주고 로그인 버튼은 숨겨요.
export const isConfigured = !String(firebaseConfig.apiKey).startsWith("YOUR_");
