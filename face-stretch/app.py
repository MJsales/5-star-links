import cv2
import numpy as np
import mediapipe as mp
import math

mp_face_mesh = mp.solutions.face_mesh
mp_hands = mp.solutions.hands

FINGERTIP_IDS = [4, 8, 12, 16, 20]

# Face contour indices for skin boundary
FACE_CONTOUR = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10]


def get_landmark_array(landmarks, w, h):
    return np.array([[lm.x * w, lm.y * h] for lm in landmarks])


def get_face_mask(face_pts, w, h):
    mask = np.zeros((h, w), dtype=np.uint8)
    pts = face_pts.astype(np.int32)
    hull = cv2.convexHull(pts)
    cv2.fillConvexPoly(mask, hull, 255)
    kernel = np.ones((15, 15), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=2)
    mask = cv2.GaussianBlur(mask, (31, 31), 10)
    return mask


def stretch_skin(frame, face_pts, finger_tip, finger_wrist, w, h):
    try:
        output = frame.copy()
        nose = face_pts[1]
        pull = finger_tip - nose
        pull_len = float(np.linalg.norm(pull))
        if pull_len < 1:
            return output
        pull_dir = pull / pull_len

        dist_to_nose = float(np.linalg.norm(finger_tip - nose))
        if dist_to_nose > 200:
            return output

        falloff = max(0, 1 - dist_to_nose / 200)
        stretch_power = falloff * 70

        face_mask = get_face_mask(face_pts, w, h)

        y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)

        nose_x, nose_y = float(nose[0]), float(nose[1])
        dx = x_coords - nose_x
        dy = y_coords - nose_y
        dist_from_nose = np.sqrt(dx**2 + dy**2)

        max_face_dist = 250
        influence = np.clip(1.0 - dist_from_nose / max_face_dist, 0, 1)
        influence = influence ** 1.5

        mask_float = face_mask.astype(np.float32) / 255.0
        influence = influence * mask_float

        angle = math.atan2(float(pull[1]), float(pull[0]))
        stretch_x = math.cos(angle) * stretch_power
        stretch_y = math.sin(angle) * stretch_power

        map_x = (x_coords - stretch_x * influence).astype(np.float32)
        map_y = (y_coords - stretch_y * influence).astype(np.float32)

        map_x = np.clip(map_x, 0, w - 1)
        map_y = np.clip(map_y, 0, h - 1)

        warped = cv2.remap(frame, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)

        alpha = influence[:, :, np.newaxis]
        stretched = (frame.astype(np.float32) * (1 - alpha) + warped.astype(np.float32) * alpha).astype(np.uint8)

        # Skin thinning effect - stretched areas become slightly lighter
        thinning = influence * falloff * 0.15
        lighten = np.stack([thinning * 20, thinning * 15, thinning * 10], axis=-1)
        stretched = np.clip(stretched.astype(np.float32) + lighten, 0, 255).astype(np.uint8)

        # Tension lines radiating from pull point
        tension_mask = np.zeros((h, w), dtype=np.float32)
        for i in range(8):
            line_angle = angle + (i - 4) * 0.15
            for r in range(20, int(150 * falloff), 3):
                px = int(nose_x + math.cos(line_angle) * r)
                py = int(nose_y + math.sin(line_angle) * r)
                if 0 <= px < w and 0 <= py < h:
                    if face_mask[py, px] > 128:
                        tension_mask[py, px] = max(0, 1 - r / (150 * falloff)) * falloff * 0.3

        tension_mask = cv2.GaussianBlur(tension_mask, (5, 5), 2)
        tension_color = np.zeros_like(stretched, dtype=np.float32)
        tension_color[:, :, 2] = tension_mask * 40  # Red tension lines
        tension_color[:, :, 1] = tension_mask * 20
        stretched = np.clip(stretched.astype(np.float32) + tension_color, 0, 255).astype(np.uint8)

        # Subtle shadow at stretch origin
        shadow_mask = np.clip(1.0 - dist_from_nose / 60, 0, 1) * falloff * 0.1
        shadow = np.stack([shadow_mask * -15, shadow_mask * -10, shadow_mask * -5], axis=-1)
        stretched = np.clip(stretched.astype(np.float32) + shadow, 0, 255).astype(np.uint8)

        return stretched

    except Exception:
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

        print("Camera ready!")
        print("Touch your face and pull to stretch your skin!")
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

            try:
                if face_results.multi_face_landmarks:
                    face_lm_raw = face_results.multi_face_landmarks[0]
                    face_pts = get_landmark_array(face_lm_raw.landmark, w, h)

                    if hand_results.multi_hand_landmarks:
                        for hand_lm in hand_results.multi_hand_landmarks:
                            hand_pts = get_landmark_array(hand_lm.landmark, w, h)
                            wrist = hand_pts[0]

                            for tip_id in FINGERTIP_IDS:
                                tip = hand_pts[tip_id]
                                nose = face_pts[1]
                                dist = float(np.linalg.norm(tip - nose))

                                if dist < 200:
                                    output = stretch_skin(output, face_pts, tip, wrist, w, h)

                                    # Draw pull indicator
                                    cv2.line(output, (int(nose[0]), int(nose[1])),
                                             (int(tip[0]), int(tip[1])), (0, 255, 255), 2)

            except Exception:
                pass

            cv2.putText(output, "Touch face + pull to stretch skin!", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(output, "Press Q to quit", (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

            cv2.imshow('Superhero Skin Stretch', output)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
