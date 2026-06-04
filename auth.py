import streamlit as st
import database as db

def login_signup_screen():
    st.title("🔐 SmartDigest Access")
    
    # 세션 상태에 현재 선택된 메뉴를 저장 (기본값: 로그인)
    if 'auth_menu' not in st.session_state:
        st.session_state['auth_menu'] = "로그인"

    # 사이드바나 상단에 라디오 버튼으로 탭 구현
    menu = ["로그인", "회원가입"]
    choice = st.segmented_control("메뉴 선택", menu, selection_mode="single", default=st.session_state['auth_menu'])
    
    # 메뉴 선택이 바뀌면 세션 상태 업데이트
    if choice:
        st.session_state['auth_menu'] = choice

    if st.session_state['auth_menu'] == "로그인":
        st.subheader("로그인")
        u_id = st.text_input("아이디", key="login_id")
        u_pw = st.text_input("비밀번호", type="password", key="login_pw")
        
        if st.button("접속하기", use_container_width=True):
            if db.check_user(u_id, u_pw):
                st.session_state['logged_in'] = True
                st.session_state['user_id'] = u_id
                st.rerun()
            else:
                st.error("계정 정보가 틀립니다.")

    else:
        st.subheader("새로운 계정 만들기")
        new_id = st.text_input("희망 아이디", key="reg_id")
        new_pw = st.text_input("희망 비밀번호", type="password", key="reg_pw")
        confirm_pw = st.text_input("비밀번호 확인", type="password", key="reg_pw_conf")
        
        if st.button("회원가입 완료", use_container_width=True):
            if new_pw != confirm_pw:
                st.warning("비밀번호가 일치하지 않습니다.")
            elif len(new_id) < 3:
                st.warning("아이디는 3자 이상이어야 합니다.")
            else:
                if db.add_user(new_id, new_pw):
                    st.success(f"{new_id}님 가입을 축하합니다! 바로 로그인해 주세요.")
                    # [핵심] 가입 성공 시 메뉴 상태를 '로그인'으로 변경하고 재실행
                    st.session_state['auth_menu'] = "로그인"
                    st.rerun() 
                else:
                    st.error("이미 존재하는 아이디입니다.")