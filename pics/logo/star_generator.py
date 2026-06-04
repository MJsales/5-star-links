import math

def create_star_obj(filename, outer_radius=1.0, inner_radius=0.4, points=5, thickness=0.15):
    vertices = []
    faces = []
    
    # Generate star profile points (2D)
    star_points = []
    for i in range(points * 2):
        angle = (i * math.pi) / points - math.pi / 2
        if i % 2 == 0:
            r = outer_radius
        else:
            r = inner_radius
        x = r * math.cos(angle)
        y = r * math.sin(angle)
        star_points.append((x, y))
    
    # Front face vertices
    front_z = thickness / 2
    back_z = -thickness / 2
    
    # Add center vertex for front and back
    vertices.append((0, 0, front_z))  # 1 - front center
    vertices.append((0, 0, back_z))   # 2 - back center
    
    # Add front face star points
    for p in star_points:
        vertices.append((p[0], p[1], front_z))
    
    # Add back face star points
    for p in star_points:
        vertices.append((p[0], p[1], back_z))
    
    # Add side vertices (connecting front to back)
    num_sides = len(star_points)
    side_start = len(vertices) + 1
    for p in star_points:
        vertices.append((p[0], p[1], front_z))
    for p in star_points:
        vertices.append((p[0], p[1], back_z))
    
    # Front face triangles (fan from center)
    for i in range(num_sides):
        v1 = 3 + i
        v2 = 3 + (i + 1) % num_sides
        faces.append((1, v1, v2))
    
    # Back face triangles (fan from center, reversed winding)
    for i in range(num_sides):
        v1 = 3 + num_sides + i
        v2 = 3 + num_sides + (i + 1) % num_sides
        faces.append((2, v2, v1))
    
    # Side faces
    for i in range(num_sides):
        front_curr = 3 + i
        front_next = 3 + (i + 1) % num_sides
        back_curr = 3 + num_sides + i
        back_next = 3 + num_sides + (i + 1) % num_sides
        
        faces.append((front_curr, back_curr, back_next))
        faces.append((front_curr, back_next, front_next))
    
    # Write OBJ file
    with open(filename, 'w') as f:
        f.write("# Star 3D Model\n")
        f.write(f"# Generated star with {points} points\n\n")
        
        for v in vertices:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        
        f.write("\n")
        
        for face in faces:
            f.write(f"f {face[0]} {face[1]} {face[2]}\n")
    
    print(f"Created {filename}")
    print(f"Vertices: {len(vertices)}")
    print(f"Faces: {len(faces)}")

if __name__ == "__main__":
    create_star_obj("D:/0ne/pics/logo/star.obj")
