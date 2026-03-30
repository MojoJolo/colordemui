import ImageCard from "./ImageCard";

export default function ImageGrid({ images, onSelect, onDelete }) {
  if (!images || images.length === 0) return null;

  return (
    <div className="image-grid">
      {images.map((img) => (
        <ImageCard
          key={img.image_id}
          image={img}
          onSelect={(selected) => onSelect(img.image_id, selected)}
          onDelete={() => onDelete(img.image_id)}
        />
      ))}
    </div>
  );
}
