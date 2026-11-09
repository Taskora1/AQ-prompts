# Photo Editing Prompts Template

## Complete Template Structure

```javascript
{
  title: "Your Prompt Title Here",
  prompt: "Detailed step-by-step instructions here...",
  image: "/images/prompts/your-image-name.webp",
  tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
  useCase: "Category Name",
  intro: "Brief 80-word description of what this prompt does...",
  uniqueFeature: "Specific technical detail that makes this prompt special...",
  bestUseCase: "Best for Instagram posts, professional work, etc..."
}
```

## Field-by-Field Guide

### 1. Title (Required)
- **Keep it short and catchy** (max 60 characters)
- **Use descriptive keywords**
- **Examples:**
  - "Vintage Film Look"
  - "Professional Headshot"
  - "Background Blur Effect"

### 2. Prompt (Required)
- **Step-by-step instructions** (numbered format)
- **Be specific and detailed**
- **Use action verbs**
- **Format:**
  ```
  "Apply effect name:\n1. STEP1: Detailed instruction\n2. STEP2: Detailed instruction\n3. STEP3: Detailed instruction\n4. STEP4: Detailed instruction\n5. STEP5: Detailed instruction\n6. OVERALL: Final result description"
  ```

### 3. Image (Required)
- **Path format:** `/images/prompts/filename.webp`
- **Use .webp format**
- **Keep filename descriptive**
- **Examples:**
  - `/images/prompts/vintage-film-look.webp`
  - `/images/prompts/professional-headshot.webp`

### 4. Tags (Required)
- **Array of 3-5 relevant tags**
- **Use lowercase**
- **Include searchable keywords**
- **Examples:**
  - `["vintage film", "35mm aesthetic", "warm tones", "film grain"]`
  - `["professional headshot", "linkedin photo", "business portrait"]`

### 5. useCase (Required)
- **Must match exact category names:**
  - `"Portrait Edits"`
  - `"Background Edits"`
  - `"Creative & Artistic"`
  - `"Photo Restore"`
  - `"Skin & Beauty"`
  - `"Trending"`

### 6. intro (Required)
- **80-word maximum**
- **Describe what the prompt does**
- **Focus on benefits**
- **Examples:**
  - "Transform your photos into classic 35mm film aesthetic with warm vintage tones and authentic film grain texture."

### 7. uniqueFeature (Required)
- **Highlight technical excellence**
- **What makes this prompt special**
- **Examples:**
  - "Fine film grain texture with subtle film borders for authentic 1970s camera look."

### 8. bestUseCase (Required)
- **Where to use this prompt**
- **Target audience**
- **Examples:**
  - "Perfect for retro Instagram posts, vintage lifestyle content, and nostalgic aesthetic feeds."

## Category Templates

### Portrait Edits Template
```javascript
{
  title: "Portrait Enhancement Name",
  prompt: "Enhance portrait with specific effect:\n1. FACE: Detailed facial instructions\n2. SKIN: Skin tone and texture\n3. EYES: Eye enhancement details\n4. LIGHTING: Portrait lighting setup\n5. OVERALL: Final portrait quality",
  image: "/images/prompts/portrait-name.webp",
  tags: ["portrait", "face enhancement", "skin", "professional"],
  useCase: "Portrait Edits",
  intro: "Professional portrait enhancement with focus on natural beauty and skin perfection.",
  uniqueFeature: "Advanced skin smoothing while maintaining natural texture and facial features.",
  bestUseCase: "Perfect for LinkedIn profiles, dating apps, and professional portraits."
}
```

### Background Edits Template
```javascript
{
  title: "Background Effect Name",
  prompt: "Apply background transformation:\n1. BACKGROUND: Specific background changes\n2. SUBJECT: Keep subject details\n3. EDGES: Clean subject separation\n4. LIGHTING: Lighting consistency\n5. OVERALL: Final background result",
  image: "/images/prompts/background-name.webp",
  tags: ["background", "blur", "remove", "replace"],
  useCase: "Background Edits",
  intro: "Professional background manipulation with clean subject separation and natural results.",
  uniqueFeature: "Advanced edge detection for clean subject-background separation.",
  bestUseCase: "Ideal for product photos, professional headshots, and ID pictures."
}
```

### Creative & Artistic Template
```javascript
{
  title: "Artistic Effect Name",
  prompt: "Apply artistic transformation:\n1. STYLE: Art style description\n2. COLORS: Color scheme details\n3. TEXTURE: Texture effects\n4. COMPOSITION: Artistic composition\n5. OVERALL: Final artistic result",
  image: "/images/prompts/artistic-name.webp",
  tags: ["artistic", "creative", "style", "effect"],
  useCase: "Creative & Artistic",
  intro: "Transform photos into artistic masterpieces with professional creative effects.",
  uniqueFeature: "Authentic art style simulation with proper texture and color grading.",
  bestUseCase: "Perfect for Instagram creative posts, artistic portfolios, and unique content."
}
```

### Photo Restore Template
```javascript
{
  title: "Restoration Effect Name",
  prompt: "Restore damaged photo:\n1. DAMAGE: Remove scratches/tears\n2. COLOR: Restore faded colors\n3. SHARPNESS: Enhance clarity\n4. NOISE: Reduce grain/noise\n5. OVERALL: Final restored quality",
  image: "/images/prompts/restore-name.webp",
  tags: ["restore", "repair", "old photo", "damage"],
  useCase: "Photo Restore",
  intro: "Professional photo restoration bringing old damaged photos back to life.",
  uniqueFeature: "Advanced damage detection and color restoration algorithms.",
  bestUseCase: "Perfect for family photos, historical images, and damaged archives."
}
```

### Skin & Beauty Template
```javascript
{
  title: "Beauty Enhancement Name",
  prompt: "Enhance beauty naturally:\n1. SKIN: Smooth and even skin tone\n2. BLEMISHES: Remove imperfections\n3. GLOW: Add healthy radiance\n4. FEATURES: Enhance natural features\n5. OVERALL: Natural beauty result",
  image: "/images/prompts/beauty-name.webp",
  tags: ["beauty", "skin", "glow", "natural"],
  useCase: "Skin & Beauty",
  intro: "Natural beauty enhancement that maintains authentic appearance while perfecting skin.",
  uniqueFeature: "Skin smoothing that preserves natural texture and avoids plastic look.",
  bestUseCase: "Ideal for beauty portraits, social media photos, and professional headshots."
}
```

### Trending Template
```javascript
{
  title: "Trending Effect Name",
  prompt: "Apply viral trending effect:\n1. STYLE: Current trend description\n2. COLORS: Trending color scheme\n3. EFFECTS: Popular effects\n4. FILTERS: Trending filters\n5. OVERALL: Viral-worthy result",
  image: "/images/prompts/trending-name.webp",
  tags: ["trending", "viral", "popular", "instagram"],
  useCase: "Trending",
  intro: "Latest trending photo effect that's going viral on social media platforms.",
  uniqueFeature: "Cutting-edge effect that matches current social media trends.",
  bestUseCase: "Perfect for TikTok, Instagram Reels, and viral social media content."
}
```

## Quick Copy-Paste Template

```javascript
{
  title: "",
  prompt: "",
  image: "/images/prompts/.webp",
  tags: ["", "", "", ""],
  useCase: "",
  intro: "",
  uniqueFeature: "",
  bestUseCase: ""
}
```

## Tips for Quality Prompts

1. **Be Specific** - Detailed instructions work better
2. **Use Numbers** - Step-by-step format is clearer
3. **Focus on Results** - Describe the final outcome
4. **Keep Natural** - Avoid over-editing descriptions
5. **Target Audience** - Know who will use this
6. **Test Your Prompts** - Make sure they work well

## Common Mistakes to Avoid

1. ❌ Vague instructions
2. ❌ Missing required fields
3. ❌ Wrong category names
4. ❌ Too long titles
5. ❌ Generic descriptions
6. ❌ Missing image paths

## Adding to Your File

1. Copy the template
2. Fill in all fields
3. Add to `PHOTO_EDITING_PROMPTS` array
4. Save the file
5. Test on your website

---

**Ready to use! Just copy, fill, and add to your prompts array.**
