// variant: "primary" | "secondary" | "danger"
export default function Button({
  variant = "primary",
  icon: Icon,
  block = false,
  className = "",
  children,
  ...rest
}) {
  const classes = ["btn", `btn-${variant}`, block ? "btn-block" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...rest}>
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
}