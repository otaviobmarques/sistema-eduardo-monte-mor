import 'server-only';
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

// Sem hifenização automática (quebrava palavras em português no meio)
Font.registerHyphenationCallback((palavra) => [palavra]);

const C = { grafite: '#373435', impacto: '#151415', texto2: '#696267', divisor: '#DED8DC', superficie: '#F6F4F5', vermelho: '#ED3237', erro: '#B42318' };
const s = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 32, fontSize: 8.5, fontFamily: 'Helvetica', color: C.grafite },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: C.vermelho },
  logo: { width: 130, height: 130 / 4.3207 },
  sistema: { fontSize: 8, color: C.texto2, textAlign: 'right' },
  titulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.impacto, marginBottom: 4 },
  filtros: { fontSize: 8.5, color: C.texto2, marginBottom: 12 },
  kpis: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpi: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: C.divisor, borderRadius: 6, padding: 8 },
  kpiRot: { fontSize: 7, color: C.texto2, textTransform: 'uppercase', marginBottom: 3 },
  kpiVal: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.impacto },
  secao: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.impacto, marginTop: 6, marginBottom: 6 },
  cab: { flexDirection: 'row', backgroundColor: C.grafite, color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  linha: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.divisor },
  zebra: { backgroundColor: C.superficie },
  cel: { paddingVertical: 4, paddingHorizontal: 4 },
  rodape: { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.texto2 },
});

export interface ColunaPdf { titulo: string; largura: number; direita?: boolean }

function Tabela({ colunas, linhas, total }: { colunas: ColunaPdf[]; linhas: string[][]; total?: string[] }) {
  return (
    <View>
      <View style={s.cab} fixed>
        {colunas.map((c) => <Text key={c.titulo} style={[s.cel, { width: `${c.largura}%`, textAlign: c.direita ? 'right' : 'left' }]}>{c.titulo}</Text>)}
      </View>
      {linhas.map((l, i) => (
        <View key={i} style={[s.linha, i % 2 ? s.zebra : {}]} wrap={false}>
          {l.map((v, j) => <Text key={j} style={[s.cel, { width: `${colunas[j].largura}%`, textAlign: colunas[j].direita ? 'right' : 'left' }]}>{v}</Text>)}
        </View>
      ))}
      {total && (
        <View style={[s.linha, { backgroundColor: '#ECE8EA' }]} wrap={false}>
          {total.map((v, j) => <Text key={j} style={[s.cel, { width: `${colunas[j].largura}%`, textAlign: colunas[j].direita ? 'right' : 'left', fontFamily: 'Helvetica-Bold' }]}>{v}</Text>)}
        </View>
      )}
    </View>
  );
}

export async function gerarPdfRelatorio(d: {
  titulo: string; filtros: string[]; geradoEm: string; logo: Buffer | null;
  kpis: { rotulo: string; valor: string }[];
  resumo: { titulo: string; colunas: ColunaPdf[]; linhas: string[][]; total?: string[] };
  detalhe?: { titulo: string; colunas: ColunaPdf[]; linhas: string[][] };
}) {
  const doc = (
    <Document title={`${d.titulo} · Sistema de OS – Auto Visão`} author="Sistema de OS – Auto Visão" language="pt-BR">
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <View style={s.topo} fixed>
          {d.logo ? <Image src={{ data: d.logo, format: 'png' }} style={s.logo} /> : <Text style={s.titulo}>Auto Visão</Text>}
          <View><Text style={s.sistema}>Sistema de OS – Auto Visão</Text><Text style={s.sistema}>Gerado em {d.geradoEm}</Text></View>
        </View>
        <Text style={s.titulo}>{d.titulo}</Text>
        <Text style={s.filtros}>Filtros: {d.filtros.join(' · ')}</Text>
        <View style={s.kpis}>
          {d.kpis.map((k) => <View key={k.rotulo} style={s.kpi}><Text style={s.kpiRot}>{k.rotulo}</Text><Text style={s.kpiVal}>{k.valor}</Text></View>)}
        </View>
        <Text style={s.secao}>{d.resumo.titulo}</Text>
        <Tabela colunas={d.resumo.colunas} linhas={d.resumo.linhas} total={d.resumo.total} />
        {d.detalhe && d.detalhe.linhas.length > 0 && (
          <View>
            <Text style={s.secao}>{d.detalhe.titulo}</Text>
            <Tabela colunas={d.detalhe.colunas} linhas={d.detalhe.linhas} />
          </View>
        )}
        <View style={s.rodape} fixed>
          <Text>{d.titulo} · {d.filtros[0]} · Sistema Domma Tecnologia · Site desenvolvido por Agência RedBox</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
