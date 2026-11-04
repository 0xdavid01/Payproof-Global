import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";

export default function Placeholder({ title }) {
  return (
    <>
      <PageHeader title={title} subtitle="This page is coming in a later step." />
      <Card>Nothing here yet.</Card>
    </>
  );
}