from PIL import Image

def remove_bg(image_path):
    try:
        img = Image.open(image_path).convert("RGBA")
        data = img.getdata()
        
        bg_color = data[0]
        
        new_data = []
        for item in data:
            if abs(item[0] - bg_color[0]) < 50 and abs(item[1] - bg_color[1]) < 50 and abs(item[2] - bg_color[2]) < 50:
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(item)
                
        img.putdata(new_data)
        img.save(image_path)
        print("Background removed successfully.")
    except Exception as e:
        print(f"Error: {e}")

remove_bg("images/new_logo.png")
