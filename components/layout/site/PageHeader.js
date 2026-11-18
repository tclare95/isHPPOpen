import PropTypes from "prop-types";

// Page title in the /history style: one h1 and an optional short lead.
export default function PageHeader({ title, lead }) {
  return (
    <header className="mb-4">
      <h1 className="display-6 fw-bold mb-2">{title}</h1>
      {lead ? <p className="lead history-intro mb-0">{lead}</p> : null}
    </header>
  );
}

PageHeader.propTypes = { title: PropTypes.node.isRequired, lead: PropTypes.node };
