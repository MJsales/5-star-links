import cv2
import numpy as np
import mediapipe as mp
import math

mp_face_mesh = mp.solutions.face_mesh
mp_hands = mp.solutions.hands

FINGERTIP_IDS = [4, 8, 12, 16, 20]


def get_landmark_array(landmarks, w, h):
    return np.array([[lm.x * w, lm.y * h] for lm in landmarks])


def apply_radial_warp(frame, center, pull_dir, radius=100, strength=40):
    h, w = frame.shape[:2]
    cy, cx = int(center[1]), int(center[0])

    y_start = max(0, cy - radius)
    y_end = min(h, cy + radius)
    x_start = max(0, cx - radius)
    x_end = min(w, cx + radius)

    if y_end <= y_start or x_end <= x_start:
        return frame

    roi = frame[y_start:y_end, x_start:x_end].copy()
    rh, rw = roi.shape[:2]

    map_y, map_x = np.mgrid[0:rh, 0:rw].astype(np.float32)

    local_cx = cx - x_start
    local_cy = cy - y_start

    dx = map_x - local_cx
    dy = map_y - local_cy
    dist = np.sqrt(dx**2 + dy**2)

    mask = np.clip(1.0 - dist / radius, 0, 1)
    mask = mask ** 2

    pull_x = pull_dir[0] * strength * mask
    pull_y = pull_dir[1] * strength * mask

    map_x = map_x - pull_x
    map_y = map_y - pull_y

    map_x = np.clip(map_x, 0, rw - 1)
    map_y = np.clip(map_y, 0, rh - 1)

    warped = cv2.remap(roi, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)

    alpha_mask = mask[:, :, np.newaxis]
    blended = roi * (1 - alpha_mask) + warped * alpha_mask

    frame[y_start:y_end, x_start:x_end] = blended.astype(np.uint8)
    return frame


def main():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    with mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as face_mesh, mp_hands.Hands(
        max_num_hands=2,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as hands:

        print("Camera ready! Move your fingers near your face to stretch it.")
        print("Press Q to quit.")

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            face_results = face_mesh.process(rgb)
            hand_results = hands.process(rgb)

            output = frame.copy()

            if face_results.multi_face_landmarks:
                face_lm_raw = face_results.multi_face_landmarks[0]
                face_pts = get_landmark_array(face_lm_raw.landmark, w, h)

                nose = face_pts[1]

                if hand_results.multi_hand_landmarks:
                    for hand_lm in hand_results.multi_hand_landmarks:
                        hand_pts = get_landmark_array(hand_lm.landmark, w, h)
                        wrist = hand_pts[0]

                        for tip_id in FINGERTIP_IDS:
                            tip = hand_pts[tip_id]
                            dist_to_nose = np.linalg.norm(tip - nose)

                            if dist_to_nose < 120:
                                finger_dir = tip - wrist
                                finger_len = np.linalg.norm(finger_dir)
                                if finger_len < 1:
                                    continue
                                finger_dir = finger_dir / finger_len

                                pull = tip - nose
                                pull_len = np.linalg.norm(pull)
                                if pull_len < 1:
                                    continue
                                pull_norm = pull / pull_len

                                falloff = max(0, 1 - dist_to_nose / 120)
                                strength = falloff * 50

                                output = apply_radial_warp(
                                    output,
                                    (nose[0], nose[1]),
                                    (pull_norm[0], pull_norm[1]),
                                    radius=int(100 + falloff * 80),
                                    strength=int(strength)
                                )

                                for i in range(len(face_pts)):
                                    fp = face_pts[i]
                                    d = np.linalg.norm(tip - fp)
                                    warp_r = 100 + falloff * 80
                                    if d < warp_r:
                                        factor = (1 - d / warp_r) ** 2 * falloff
                                        new_pos = fp + pull_norm * factor * strength
                                        cv2.circle(output, (int(new_pos[0]), int(new_pos[1])), 1, (0, 255, 0), -1)

                for pt in face_pts[::5].astype(int):
                    cv2.circle(output, (int(pt[0]), int(pt[1])), 1, (255, 255, 255), -1)

            if hand_results.multi_hand_landmarks:
                for hand_lm in hand_results.multi_hand_landmarks:
                    for tip_id in FINGERTIP_IDS:
                        tip = hand_lm.landmark[tip_id]
                        tx, ty = int(tip.x * w), int(tip.y * h)
                        cv2.circle(output, (tx, ty), 8, (0, 0, 255), -1)
                        cv2.circle(output, (tx, ty), 10, (255, 255, 255), 2)

            cv2.putText(output, "Pull your face with your fingers!", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            cv2.putText(output, "Press Q to quit", (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

            cv2.imshow('Face Stretch', output)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
