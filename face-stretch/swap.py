import cv2
import numpy as np
import mediapipe as mp
import sys
import os
import tkinter as tk
from tkinter import filedialog

mp_face_mesh = mp.solutions.face_mesh
mp_selfie_segmentation = mp.solutions.selfie_segmentation

# Key face landmark indices for alignment
# Nose tip, chin, left/right eye corners, mouth corners
ALIGN_POINTS = [1, 152, 33, 263, 61, 291]  # nose, chin, left eye, right eye, left mouth, right mouth

# Face oval for mask
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]


def get_landmarks(face_landmarks, w, h):
    return np.array([[lm.x * w, lm.y * h] for lm in face_landmarks.landmark])


def get_alignment_points(pts):
    return pts[ALIGN_POINTS].astype(np.float32)


def get_face_mask_landmarks(pts, w, h):
    mask = np.zeros((h, w), dtype=np.uint8)
    oval_pts = pts[FACE_OVAL].astype(np.int32)
    cv2.fillConvexPoly(mask, oval_pts, 255)
    kernel = np.ones((7, 7), np.uint8)
    mask = cv2.erode(mask, kernel, iterations=2)
    mask = cv2.dilate(mask, kernel, iterations=3)
    mask = cv2.GaussianBlur(mask, (21, 21), 10)
    return mask


def warp_face(src_img, src_pts, dst_pts, dst_shape):
    h, w = dst_shape[:2]

    # Get bounding rects
    src_rect = cv2.boundingRect(src_pts.astype(np.float32))
    dst_rect = cv2.boundingRect(dst_pts.astype(np.float32))

    # Offset points
    src_offset = []
    dst_offset = []
    for i in range(len(src_pts)):
        src_offset.append((src_pts[i][0] - src_rect[0], src_pts[i][1] - src_rect[1]))
        dst_offset.append((dst_pts[i][0] - dst_rect[0], dst_pts[i][1] - dst_rect[1]))

    src_offset = np.array(src_offset, dtype=np.float32)
    dst_offset = np.array(dst_offset, dtype=np.float32)

    # Get affine transform
    mat = cv2.getAffineTransform(src_offset, dst_offset)

    # Warp
    crop_w = dst_rect[2]
    crop_h = dst_rect[3]
    warped = cv2.warpAffine(src_img, mat, (crop_w, crop_h),
                            flags=cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_REFLECT_101)

    return warped, dst_rect


def color_transfer(src, dst_mask):
    src_float = src.astype(np.float32)
    mask_bool = dst_mask > 128

    if mask_bool.sum() < 100:
        return src

    for c in range(3):
        src_channel = src_float[:, :, c]
        src_mean = src_channel[mask_bool].mean()
        src_std = src_channel[mask_bool].std() + 1e-6

        # Slight color normalization
        src_channel[mask_bool] = (src_channel[mask_bool] - src_mean) * 0.7 + src_mean

    return np.clip(src_float, 0, 255).astype(np.uint8)


def seamless_swap(frame, warped_face, dst_rect, face_mask):
    h, w = frame.shape[:2]
    x, y, rw, rh = dst_rect

    # Ensure within bounds
    x = max(0, x)
    y = max(0, y)
    rw = min(rw, w - x)
    rh = min(rh, h - y)

    if rw <= 0 or rh <= 0:
        return frame

    # Resize warped face to match crop
    if warped_face.shape[0] != rh or warped_face.shape[1] != rw:
        warped_face = cv2.resize(warped_face, (rw, rh))

    # Create mask for seamless clone
    clone_mask = face_mask[y:y+rh, x:x+rw].copy()
    if clone_mask.shape[0] != rh or clone_mask.shape[1] != rw:
        clone_mask = cv2.resize(clone_mask, (rw, rh))

    # Ensure valid mask
    _, clone_mask_bin = cv2.threshold(clone_mask, 127, 255, cv2.THRESH_BINARY)

    # Find center for seamless clone
    center = (x + rw // 2, y + rh // 2)

    try:
        output = cv2.seamlessClone(warped_face, frame, clone_mask_bin, center, cv2.NORMAL_CLONE)
        return output
    except:
        # Fallback to alpha blending
        output = frame.copy()
        alpha = clone_mask.astype(np.float32) / 255.0
        alpha = alpha[:, :, np.newaxis]
        roi = frame[y:y+rh, x:x+rw]
        if roi.shape == warped_face.shape:
            blended = (roi * (1 - alpha) + warped_face * alpha).astype(np.uint8)
            output[y:y+rh, x:x+rw] = blended
        return output


def overlay_body(frame, photo, photo_seg, webcam_seg, face_rect):
    h, w = frame.shape[:2]
    ph, pw = photo.shape[:2]

    # Resize photo to match webcam
    photo_resized = cv2.resize(photo, (w, h))
    photo_seg_resized = cv2.resize(photo_seg, (w, h))

    # Body mask from photo segmentation (exclude face area)
    body_mask = (photo_seg_resized > 0.5).astype(np.uint8) * 255

    # Exclude face area from body overlay
    if face_rect is not None:
        x, y, rw, rh = face_rect
        face_region = np.zeros((h, w), dtype=np.uint8)
        # Expand face region slightly
        padding = 20
        fx = max(0, x - padding)
        fy = max(0, y - padding)
        frw = min(w - fx, rw + 2 * padding)
        frh = min(h - fy, rh + 2 * padding)
        face_region[fy:fy+frh, fx:fx+frw] = 255
        body_mask = cv2.bitwise_and(body_mask, cv2.bitwise_not(face_region))

    # Smooth the mask
    body_mask = cv2.GaussianBlur(body_mask, (31, 31), 15)

    # Blend body
    alpha = body_mask[:, :, np.newaxis].astype(np.float32) / 255.0
    output = (frame * (1 - alpha) + photo_resized * alpha).astype(np.uint8)

    return output


def main():
    if len(sys.argv) >= 2:
        photo_path = sys.argv[1]
    else:
        root = tk.Tk()
        root.withdraw()
        photo_path = filedialog.askopenfilename(
            title="Select a photo of someone to swap onto yourself",
            filetypes=[("Images", "*.jpg *.jpeg *.png *.webp *.bmp")]
        )
        root.destroy()

    if not photo_path:
        print("No photo selected!")
        sys.exit(1)

    if not os.path.exists(photo_path):
        print(f"Photo not found: {photo_path}")
        sys.exit(1)

    print("Loading photo...")
    photo = cv2.imread(photo_path)
    if photo is None:
        print("Could not read photo")
        sys.exit(1)

    print(f"Photo loaded: {photo.shape[1]}x{photo.shape[0]}")

    # Detect face in photo
    photo_rgb = cv2.cvtColor(photo, cv2.COLOR_BGR2RGB)
    photo_h, photo_w = photo.shape[:2]

    with mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as face_mesh:

        photo_results = face_mesh.process(photo_rgb)

        if not photo_results.multi_face_landmarks:
            print("No face found in photo! Try a clearer photo.")
            sys.exit(1)

        photo_landmarks = photo_results.multi_face_landmarks[0]
        photo_pts = get_landmarks(photo_landmarks, photo_w, photo_h)
        photo_align = get_alignment_points(photo_pts)
        photo_face_mask = get_face_mask_landmarks(photo_pts, photo_w, photo_h)

        print("Face detected in photo!")

        # Body segmentation for photo
        with mp_selfie_segmentation.SelfieSegmentation(model_selection=1) as temp_seg:
            photo_seg_results = temp_seg.process(photo_rgb)
            photo_seg_mask = photo_seg_results.segmentation_mask

        print("Starting webcam... (press Q to quit)")

        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

        with mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        ) as webcam_face_mesh, mp_selfie_segmentation.SelfieSegmentation(model_selection=1) as selfie_seg:

            mode = "face"  # face, body, both

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                frame = cv2.flip(frame, 1)
                h, w, _ = frame.shape
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                webcam_results = webcam_face_mesh.process(rgb)

                output = frame.copy()
                face_rect = None

                try:
                    if webcam_results.multi_face_landmarks:
                        webcam_landmarks = webcam_results.multi_face_landmarks[0]
                        webcam_pts = get_landmarks(webcam_landmarks, w, h)
                        webcam_align = get_alignment_points(webcam_pts)

                        # Warp photo face to webcam
                        warped, face_rect = warp_face(photo, photo_align, webcam_align, (h, w, 3))

                        # Get face mask for webcam
                        webcam_face_mask = get_face_mask_landmarks(webcam_pts, w, h)

                        # Color transfer
                        warped = color_transfer(warped, webcam_face_mask)

                        # Seamless clone
                        if mode in ["face", "both"]:
                            output = seamless_swap(output, warped, face_rect, webcam_face_mask)

                        # Body overlay
                        if mode in ["body", "both"]:
                            webcam_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            webcam_seg = selfie_seg.process(webcam_rgb)
                            output = overlay_body(output, photo, photo_seg_mask, webcam_seg.segmentation_mask, face_rect)

                except Exception as e:
                    pass

                # Mode indicator
                colors = {"face": (0, 255, 255), "body": (255, 0, 255), "both": (0, 255, 0)}
                cv2.putText(output, f"Mode: {mode.upper()}", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, colors[mode], 2)
                cv2.putText(output, "1=Face  2=Body  3=Both  Q=Quit", (10, 60),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

                # Show photo preview
                photo_preview = cv2.resize(photo, (160, 120))
                output[10:130, w-170:w-10] = photo_preview
                cv2.rectangle(output, (w-170, 10), (w-10, 130), (255, 255, 255), 2)

                cv2.imshow('Face Swap', output)

                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('1'):
                    mode = "face"
                    print("Mode: FACE SWAP")
                elif key == ord('2'):
                    mode = "body"
                    print("Mode: BODY OVERLAY")
                elif key == ord('3'):
                    mode = "both"
                    print("Mode: BOTH")

        cap.release()
        cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
