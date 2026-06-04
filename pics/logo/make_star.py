import math

def create_star():
    outer_r = 1.0
    inner_r = 0.4
    points = 5
    thickness = 0.15
    
    # Generate star points
    star_pts = []
    for i in range(points * 2):
        angle = (i * math.pi) / points - math.pi / 2
        r = outer_r if i % 2 == 0 else inner_r
        star_pts.append((r * math.cos(angle), r * math.sin(angle)))
    
    verts = []
    faces = []
    
    # Front and back centers
    verts.append((0, 0, thickness/2))
    verts.append((0, 0, -thickness/2))
    
    # Front face points
    for p in star_pts:
        verts.append((p[0], p[1], thickness/2))
    
    # Back face points
    for p in star_pts:
        verts.append((p[0], p[1], -thickness/2))
    
    n = len(star_pts)
    
    # Front face (center=1)
    for i in range(n):
        faces.append((1, 3+i, 3+(i+1)%n))
    
    # Back face (center=2)
    for i in range(n):
        faces.append((2, 3+n+(i+1)%n, 3+n+i))
    
    # Sides
    for i in range(n):
        f1 = 3+i
        f2 = 3+(i+1)%n
        b1 = 3+n+i
        b2 = 3+n+(i+1)%n
        faces.append((f1, b1, b2))
        faces.append((f1, b2, f2))
    
    with open("D:/0ne/pics/logo/star.obj", "w") as f:
        f.write("# Star 3D Model\n\n")
        for v in verts:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        f.write("\n")
        for face in faces:
            f.write(f"f {face[0]} {face[1]} {face[2]}\n")
    
    print(f"Created star.obj - {len(verts)} vertices, {len(faces)} faces")

create_star()
