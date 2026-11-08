/*
 * Les pages du CRM, dans la coque commune ((coque)/layout.tsx) : leur
 * conteneur, auquel crm.css et les pages se rattachent (#view, .vue-crm).
 */
export default function PagesCrm({ children }: { children: React.ReactNode }) {
  return (
    <div id="view" className="vue-crm">
      {children}
    </div>
  );
}
