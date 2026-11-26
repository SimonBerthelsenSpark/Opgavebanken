import { navigate } from '../App'
import { deleteSet, useSets } from '../store'

export function SetsPage({ uid }: { uid: string }) {
  const sets = useSets(uid)
  return (
    <>
      <div className="page-head">
        <h1>Gemte sæt</h1>
      </div>
      {sets === null ? (
        <p className="muted">Henter …</p>
      ) : sets.length === 0 ? (
        <div className="panel empty">
          <p>Du har ingen gemte sæt endnu. Vælg opgaver i banken og tryk “Dan opgavesæt”.</p>
          <button type="button" className="btn primary" onClick={() => navigate('/')}>
            Til opgavebanken
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="bank">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Gemt</th>
                <th className="r">Opgaver</th>
                <th className="r">Point</th>
                <th>
                  <span className="sr-only">Handlinger</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a
                      href={`/saet/${s.id}`}
                      onClick={(e) => {
                        e.preventDefault()
                        navigate(`/saet/${s.id}`)
                      }}
                    >
                      {s.title}
                    </a>
                  </td>
                  <td>{new Date(s.createdAt).toLocaleDateString('da-DK', { dateStyle: 'medium' })}</td>
                  <td className="r num">{s.tasks.length}</td>
                  <td className="r num">{s.totalPoints}</td>
                  <td className="r">
                    <button
                      type="button"
                      className="btn ghost xs danger"
                      onClick={() => confirm(`Slet sættet "${s.title}"? Opgaverne i banken påvirkes ikke.`) && deleteSet(uid, s.id)}
                    >
                      Slet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
