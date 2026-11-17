import Link from "next/link";
import PropTypes from "prop-types";

// Shared page title block: optional breadcrumb and eyebrow, one h1, a short lead and optional actions.
export default function PageHeader({ title, eyebrow, lead, breadcrumb, children, className }) {
  return (
    <header className={`site-page-header${className ? ` ${className}` : ""}`}>
      {breadcrumb?.length ? (
        <nav className="site-breadcrumb" aria-label="Breadcrumb">
          <ol>{breadcrumb.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ol>
        </nav>
      ) : null}
      {eyebrow ? <p className="site-eyebrow">{eyebrow}</p> : null}
      <h1 className="site-page-title">{title}</h1>
      {lead ? <p className="site-lead">{lead}</p> : null}
      {children ? <div className="site-page-header__actions">{children}</div> : null}
    </header>
  );
}

PageHeader.propTypes = {
  title: PropTypes.node.isRequired,
  eyebrow: PropTypes.node,
  lead: PropTypes.node,
  breadcrumb: PropTypes.arrayOf(PropTypes.shape({ href: PropTypes.string.isRequired, label: PropTypes.node.isRequired })),
  children: PropTypes.node,
  className: PropTypes.string,
};
