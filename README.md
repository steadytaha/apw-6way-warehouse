# APW demo: 6-way shuttle compact pallet warehouse

Live demo: https://steadytaha.github.io/apw-6way-warehouse/

A course project (Digital Warehousing and Transportation, University of Padova). An analytic model of a compact pallet warehouse with 6-way shuttles and rail-deck shuttle lifts: give a building or a pallet target and it proposes racks, lifts and shuttles, and shows flows, energy and cost with a 3D view.

- The model is our own analytic model, **not a vendor quote** and not a compliance certificate. Every assumed value is marked as an assumption in the page.
- It runs entirely in your browser (Python via Pyodide, served from this site); nothing is sent anywhere, no cookies, no analytics. The first "Run" downloads the Python runtime and the model from this site (about 5 to 8 MB, once). The 3D library (three.js) is also served from this site, so no third-party server is contacted.
- Open the live demo on a phone or a desktop browser (a recent Chrome, Edge, Firefox or Safari). A downloadable offline package may be offered under Releases.

## Sources the model refers to
Links only: no paper, standard or third-party file is hosted here. DOI links were checked to resolve. Sources that could not be verified are marked "not verified" and are not used as sourced values. Citation of a standard is not a compliance claim.

### 6-way, shuttle-based (SBS/RS) and vehicle-based (AVS/RS) storage: design and performance

- Tappia, E., Roy, D., De Koster, R., & Melacini, M. (2017; online 2016). Modeling, analysis, and design insights for shuttle-based compact storage systems. Transportation Science, 51(1), 269–295. [https://doi.org/10.1287/trsc.2016.0699](https://doi.org/10.1287/trsc.2016.0699)
- Kuo, P.-H., Krishnamurthy, A., & Malmborg, C. J. (2007). Design models for unit load storage and retrieval systems using autonomous vehicle technology and resource conserving storage and dwell point policies. Applied Mathematical Modelling, 31(10), 2332–2346. [https://doi.org/10.1016/j.apm.2006.09.011](https://doi.org/10.1016/j.apm.2006.09.011)
- Marchet, G., Melacini, M., Perotti, S., & Tappia, E. (2012). Analytical model to estimate performances of autonomous vehicle storage and retrieval systems for product totes. International Journal of Production Research, 50(24), 7134–7148. [https://doi.org/10.1080/00207543.2011.639815](https://doi.org/10.1080/00207543.2011.639815)
- Marchet, G., Melacini, M., Perotti, S., & Tappia, E. (2013). Development of a framework for the design of autonomous vehicle storage and retrieval systems. International Journal of Production Research, 51(14), 4365–4387. [https://doi.org/10.1080/00207543.2013.778430](https://doi.org/10.1080/00207543.2013.778430)
- Roy, D., Krishnamurthy, A., Heragu, S., & Malmborg, C. (2012). Performance analysis and design trade-offs in autonomous vehicle based storage and retrieval systems. IIE Transactions, 44(12), 1045–1060. [https://doi.org/10.1080/0740817X.2012.665201](https://doi.org/10.1080/0740817X.2012.665201)
- Roy, D., Krishnamurthy, A., Heragu, S., & Malmborg, C. (2015). Queuing models to analyze dwell-point and cross-aisle location in autonomous vehicle-based warehouse systems. European Journal of Operational Research, 242(1), 72–87. [https://doi.org/10.1016/j.ejor.2014.09.040](https://doi.org/10.1016/j.ejor.2014.09.040)
- Roy, D., Krishnamurthy, A., Heragu, S. S., & Malmborg, C. (2017). A multi-tier linking approach to analyze performance of autonomous vehicle-based storage and retrieval systems. Computers & Operations Research, 83, 173–188. [https://doi.org/10.1016/j.cor.2017.02.012](https://doi.org/10.1016/j.cor.2017.02.012)
- Kumar, A., Roy, D., & Tiwari, M. K. (2014; online 2013). Optimal partitioning of vertical zones in vehicle-based warehouse systems. International Journal of Production Research, 52(5), 1285–1305. [https://doi.org/10.1080/00207543.2013.828167](https://doi.org/10.1080/00207543.2013.828167)
- Fukunari, M., & Malmborg, C. J. (2008). Cycle time model for autonomous vehicle storage and retrieval systems. International Journal of Production Research, 46(12). [https://doi.org/10.1080/00207540601118454](https://doi.org/10.1080/00207540601118454)
- Fukunari, M., & Malmborg, C. J. (2009). Network queuing approach for autonomous vehicle storage and retrieval systems. European Journal of Operational Research, 193(1), 152–167. [https://doi.org/10.1016/j.ejor.2007.10.049](https://doi.org/10.1016/j.ejor.2007.10.049)
- Cai, X., Heragu, S. S., & Liu, Y. (2014). Modeling and evaluating the AVS/RS with tier-to-tier vehicles using a semi-open queueing network. IIE Transactions, 46(9), 905–927. [https://doi.org/10.1080/0740817X.2013.849832](https://doi.org/10.1080/0740817X.2013.849832)
- Dong, W., & Jin, M. (2021). Travel time models for tier-to-tier SBS/RS with different storage assignment policies and shuttle dispatching rules. Transportation Research Part E, 155, 102485. [https://doi.org/10.1016/j.tre.2021.102485](https://doi.org/10.1016/j.tre.2021.102485)
- Ha, Y., & Chae, J. (2018). Free balancing for a shuttle-based storage and retrieval system. Simulation Modelling Practice and Theory, 82, 12–31. [https://doi.org/10.1016/j.simpat.2017.12.006](https://doi.org/10.1016/j.simpat.2017.12.006)
- Ha, Y., & Chae, J. (2019). A decision model to determine the number of shuttles in a tier-to-tier SBS/RS. International Journal of Production Research, 57(4), 963–984. [https://doi.org/10.1080/00207543.2018.1476787](https://doi.org/10.1080/00207543.2018.1476787)
- Zhao, X., Zhang, R., Zhang, N., Wang, Y., Jin, M., & Mou, S. (2020). Analysis of the shuttle-based storage and retrieval system. IEEE Access, 8, 146154–146165. [https://doi.org/10.1109/access.2020.3014102](https://doi.org/10.1109/access.2020.3014102)
- Eder, M. (2020). Performance calculation of shuttle-based storage and retrieval systems with multiple-deep storage (tier-captive). The International Journal of Advanced Manufacturing Technology, 107(1–2), 859–873. [https://doi.org/10.1007/s00170-019-04831-7](https://doi.org/10.1007/s00170-019-04831-7)
- Eder, M. (2020). An approach for performance evaluation of SBS/RS with shuttle vehicles serving multiple tiers of multiple-deep storage rack. The International Journal of Advanced Manufacturing Technology, 110(11–12), 3241–3256. [https://doi.org/10.1007/s00170-020-06033-y](https://doi.org/10.1007/s00170-020-06033-y)
- Eder, M. (2023). An analytical approach of multiple-aisle shuttle-based storage and retrieval systems. The International Journal of Advanced Manufacturing Technology, 127, 1585–1596. [https://doi.org/10.1007/s00170-023-11485-z](https://doi.org/10.1007/s00170-023-11485-z)
- Eder, M. (2024). Analytical examination of shuttle-based storage and retrieval systems with multiple-capacity lifts. The International Journal of Advanced Manufacturing Technology, 133, 5053–5064. [https://doi.org/10.1007/s00170-024-14058-w](https://doi.org/10.1007/s00170-024-14058-w)
- Lerher, T., Potrč, I., Šraml, M., & Tollazzi, T. (2010). Travel time models for automated warehouses with aisle transferring storage and retrieval machine. European Journal of Operational Research, 205(3), 571–583. [https://doi.org/10.1016/j.ejor.2010.01.025](https://doi.org/10.1016/j.ejor.2010.01.025)
- Lerher, T., Ekren, Y. B., Sari, Z., & Rosi, B. (2015). Simulation analysis of shuttle based storage and retrieval systems. International Journal of Simulation Modelling, 14(1), 48–59. [https://doi.org/10.2507/ijsimm14(1)5.281](https://doi.org/10.2507/ijsimm14(1)5.281)
- Kosanić, N. Z., Milojević, G. Z., & Zrnić, N. Đ. (2018). A survey of literature on shuttle based storage and retrieval systems. FME Transactions, 46(3), 400–409. [https://doi.org/10.5937/fmet1803400k](https://doi.org/10.5937/fmet1803400k)
- Li, D., Smith, J. S., & Li, Y. (2019). Coordinated control of multi-zone AVS/RS, conveyors and pick-up operations in warehouse system. In Mustafee et al. (Eds.), Proceedings of the 2019 Winter Simulation Conference (pp. 2049–2060). IEEE. [https://doi.org/10.1109/wsc40007.2019.9004925](https://doi.org/10.1109/wsc40007.2019.9004925)
- Li, D., Smith, J. S., & Li, Y. (2022). Design and control of shuttle-based storage and retrieval systems using a simulation approach. In Feng et al. (Eds.), Proceedings of the 2022 Winter Simulation Conference (pp. 1425–1436). IEEE. [https://doi.org/10.1109/wsc57314.2022.10015406](https://doi.org/10.1109/wsc57314.2022.10015406)
- Zou, B., Xu, X., Gong, Y., & De Koster, R. (2016). Modeling parallel movement of lifts and vehicles in tier-captive vehicle-based warehousing systems. European Journal of Operational Research, 254(1), 51–67. [https://doi.org/10.1016/j.ejor.2016.03.039](https://doi.org/10.1016/j.ejor.2016.03.039)
- Deng, L., Chen, L., Zhao, J., & Wang, R. (2021). Modeling and performance analysis of shuttle-based compact storage systems under parallel processing policy. PLOS ONE, 16(11), e0259773. [https://doi.org/10.1371/journal.pone.0259773](https://doi.org/10.1371/journal.pone.0259773)
- Mao, J., Cheng, J., Li, X., & Cao, B. (2023). Research on scheduling optimization of four-way shuttle-based storage and retrieval systems. Scientific Reports, 13, Article 3999. [https://doi.org/10.1038/s41598-023-31050-8](https://doi.org/10.1038/s41598-023-31050-8)
- Battarra, I., Accorsi, R., Manzini, R., & Rubini, S. (2022). Hybrid model for the design of a deep-lane multisatellite AVS/RS. The International Journal of Advanced Manufacturing Technology, 121, 1191–1217. [https://doi.org/10.1007/s00170-022-09375-x](https://doi.org/10.1007/s00170-022-09375-x)
- Lupi, G., Accorsi, R., Battarra, I., Manzini, R., & Sirri, G. (2024). Space efficiency and throughput performance in AVS/RS under variant lane depths. The International Journal of Advanced Manufacturing Technology, 131, 1449–1466. [https://doi.org/10.1007/s00170-024-13160-3](https://doi.org/10.1007/s00170-024-13160-3)
- Jerman, B., Ekren, B. Y., Küçükyaşar, M., & Lerher, T. (2021). Simulation-based performance analysis for a novel AVS/RS technology with movable lifts. Applied Sciences, 11(5), 2283. [https://doi.org/10.3390/app11052283](https://doi.org/10.3390/app11052283)
- Borovinšek, M., Ekren, B. Y., Burinskienė, A., & Lerher, T. (2017; online 2016). Multi-objective optimisation model of shuttle-based storage and retrieval system. Transport, 32(2), 120–137. [https://doi.org/10.3846/16484142.2016.1186732](https://doi.org/10.3846/16484142.2016.1186732)
- Heragu, S. S., Cai, X., Krishnamurthy, A., & Malmborg, C. J. (2011). Analytical models for analysis of automated warehouse material handling systems. International Journal of Production Research, 49(22), 6833–6861. [https://doi.org/10.1080/00207543.2010.518994](https://doi.org/10.1080/00207543.2010.518994)
- Azadeh, K., De Koster, R., & Roy, D. (2019). Robotized and automated warehouse systems: Review and recent developments. Transportation Science, 53(4), 917-945. [https://doi.org/10.1287/trsc.2018.0873](https://doi.org/10.1287/trsc.2018.0873)
- Epp, M., Wiedemann, S., & Furmans, K. (2017; online 2016). A discrete-time queueing network approach to performance evaluation of autonomous vehicle storage and retrieval systems. International Journal of Production Research, 55(4), 960–978. [https://doi.org/10.1080/00207543.2016.1208371](https://doi.org/10.1080/00207543.2016.1208371)
- Gagliardi, J.-P., Renaud, J., & Ruiz, A. (2012). Models for automated storage and retrieval systems: a literature review. International Journal of Production Research, 50(24), 7110–7125. [https://doi.org/10.1080/00207543.2011.633234](https://doi.org/10.1080/00207543.2011.633234)
- Roodbergen, K. J., & Vis, I. F. A. (2009). A survey of literature on automated storage and retrieval systems. European Journal of Operational Research, 194(2), 343–362. [https://doi.org/10.1016/j.ejor.2008.01.038](https://doi.org/10.1016/j.ejor.2008.01.038)
- Accorsi, R., Bortolini, M., Gamberi, M., Manzini, R., & Pilati, F. (2017). Best building shape for automated storage and retrieval systems. International Journal of Advanced Manufacturing Technology, 92. [https://doi.org/10.1007/s00170-017-0157-9](https://doi.org/10.1007/s00170-017-0157-9)
- Wang, R., Tao, P., Chen, R., Zhu, T., & Yang, P. (2025). Retrieval scheduling in four-directional shuttle-based compact storage and retrieval systems with heterogeneous lifts. Computers & Industrial Engineering, 210, 111559. [https://doi.org/10.1016/j.cie.2025.111559](https://doi.org/10.1016/j.cie.2025.111559)

### Queueing and waiting time

- Hokstad, P. (1978). Approximations for the M/G/m queue. Operations Research, 26(3), 510–523. [https://doi.org/10.1287/opre.26.3.510](https://doi.org/10.1287/opre.26.3.510)
- Ekren, B. Y., & Akpunar, A. (2021). Open queuing network tool for SBS/RS. Applied Mathematical Modelling, 89, 1678–1695. [https://doi.org/10.1016/j.apm.2020.07.055](https://doi.org/10.1016/j.apm.2020.07.055)
- Lee, H. W., & Cho, E.-s. (2007). An auxiliary server threshold queueing model and its application to the operational characteristics of web server system. Applied Mathematical Modelling, 31, 2213–2226. [https://doi.org/10.1016/j.apm.2006.08.025](https://doi.org/10.1016/j.apm.2006.08.025)
- Wang, K.-H., Wang, T.-Y., & Pearn, W. L. (2007). Optimal control of the N policy M/G/1 queueing system with server breakdowns and general startup times. Applied Mathematical Modelling, 31, 2199–2212. [https://doi.org/10.1016/j.apm.2006.08.016](https://doi.org/10.1016/j.apm.2006.08.016)

### Class-based storage, ABC, honeycombing and storage density

- Guo, X., Yu, Y., & De Koster, R. B. M. (2016). Impact of required storage space on storage policy performance in a unit-load warehouse. International Journal of Production Research, 54(8), 2405–2418. [https://doi.org/10.1080/00207543.2015.1083624](https://doi.org/10.1080/00207543.2015.1083624)
- Kriehn, T., Schloz, F., Wehking, K.-H., & Fittinghoff, M. (2018). Impact of class-based storage, sequencing of retrieval requests and warehouse reorganisation on throughput of shuttle-based storage and retrieval systems. FME Transactions, 46(3), 320–329. [https://doi.org/10.5937/fmet1803320K](https://doi.org/10.5937/fmet1803320K)
- Eder, M. (2022). An analytical approach for a performance calculation of shuttle-based storage and retrieval systems with multiple-deep and class-based storage. Production & Manufacturing Research, 10(1), 321–336. [https://doi.org/10.1080/21693277.2022.2083715](https://doi.org/10.1080/21693277.2022.2083715)
- Yu, Y., & De Koster, M. B. M. (2006). Optimal storage rack design for a 3D compact AS/RS with full turnover-based storage. ERIM Report ERS-2006-026-LIS, Erasmus University Rotterdam (working paper; DOI of the related journal paper not verified, so no link).
- Zaerpour, N., Yu, Y., & De Koster, R. B. M. (2017). Response time analysis of a live-cube compact storage system with two storage classes. IISE Transactions, 49(5), 461–480. [https://doi.org/10.1080/24725854.2016.1273563](https://doi.org/10.1080/24725854.2016.1273563)
- Zaerpour, N., Yu, Y., & De Koster, R. B. M. (2017). Optimal two-class-based storage in a live-cube compact storage system. IISE Transactions, 49(7), 653-668. [https://doi.org/10.1080/24725854.2016.1273564](https://doi.org/10.1080/24725854.2016.1273564)
- Marolt, J., Kosanić, N., & Lerher, T. (2021). Relocation and storage assignment strategies evaluation in a multiple-deep tier-captive automated vehicles storage and retrieval system with undetermined retrieval sequence. The International Journal of Advanced Manufacturing Technology, 118(9–10), 3403–3420. [https://doi.org/10.1007/s00170-021-08169-x](https://doi.org/10.1007/s00170-021-08169-x)
- Kallina, C., & Lynn, J. (1976). Application of the cube-per-order index rule for stock location in a distribution warehouse. Interfaces, 7(1), 37-46. [https://doi.org/10.1287/inte.7.1.37](https://doi.org/10.1287/inte.7.1.37)

### Energy, cost and sustainability

- Tappia, E., Marchet, G., Melacini, M., & Perotti, S. (2015). Incorporating the environmental dimension in the assessment of automated warehouses. Production Planning & Control, 26(10), 824–838. [https://doi.org/10.1080/09537287.2014.990945](https://doi.org/10.1080/09537287.2014.990945)
- Ekren, B. Y., Akpunar, A., Sarı, Z., & Lerher, T. (2018). Tool for energy consumption and regeneration in shuttle-based storage and retrieval systems. Applied Mathematical Modelling, 63. [https://doi.org/10.1016/j.apm.2018.06.037](https://doi.org/10.1016/j.apm.2018.06.037)
- Ekren, B. Y., Kaya, B., & Küçükyaşar, M. (2023). Shuttle-based storage and retrieval systems designs from multi-objective perspectives: total investment cost, throughput rate and sustainability. Sustainability, 15(1), 762. [https://doi.org/10.3390/su15010762](https://doi.org/10.3390/su15010762)
- Küçükyaşar, M., Ekren, B. Y., & Lerher, T. (2021). Cost and performance comparison for tier-captive and tier-to-tier SBS/RS warehouse configurations. International Transactions in Operational Research, 28(4), 1847–1863. [https://doi.org/10.1111/itor.12864](https://doi.org/10.1111/itor.12864)
- Küçükyaşar, M., & Ekren, B. Y. (2021 online, 2022 in print). An experimental design study to identify significant factors affecting tier-to-tier SBS/RS performance. In Industrial Engineering in the Internet-of-Things World (Lecture Notes in Management and Industrial Engineering), Springer, pp. 191–201. [https://doi.org/10.1007/978-3-030-76724-2_15](https://doi.org/10.1007/978-3-030-76724-2_15)

### Resilience and availability

- Rockenschaub, C., & Kaever, D. (2026). Increasing operational resilience in automated warehouses: An SBS/RS case study. Communications of the ECMS, 40(1) (Proceedings of ECMS 2026; eds. Sanfilippo et al.). [https://doi.org/10.7148/2026-0024](https://doi.org/10.7148/2026-0024)
- Lewczuk, K. (2021). The study on the automated storage and retrieval system dependability. Eksploatacja i Niezawodność – Maintenance and Reliability, 23(4), 709–718. [https://doi.org/10.17531/ein.2021.4.13](https://doi.org/10.17531/ein.2021.4.13)
- Colabianchi, S., Bernabei, M., Costantino, F., Romano, E., & Falegnami, A. (2023). MARLIN method: Enhancing warehouse resilience in response to disruptions. Logistics, 7(4), 95. [https://doi.org/10.3390/logistics7040095](https://doi.org/10.3390/logistics7040095)
- Rodríguez-García, M., Kembro, J. H., Betts, K., & Ponce-Cueto, E. (2025). Managing technology-related disruptions and vulnerabilities in highly automated warehouse systems: An integrative review and research agenda. International Journal of Production Research, 64(5), 1676–1708. [https://doi.org/10.1080/00207543.2025.2552281](https://doi.org/10.1080/00207543.2025.2552281)
- Kembro, J. H., & Norrman, A. (2025). A strategic perspective on automated warehouse systems in retail: insights from a multiple case study. International Journal of Physical Distribution & Logistics Management, 55(11), 57–91. [https://doi.org/10.1108/ijpdlm-05-2024-0218](https://doi.org/10.1108/ijpdlm-05-2024-0218)
- Kostrzewski, M., Gnap, J., Varjan, P., & Likos, M. (2020). Application of simulation methods for study on availability of one-aisle machine order picking process. Communications – Scientific Letters of the University of Žilina, 22(2), 107–114. [https://doi.org/10.26552/com.C.2020.2.107-114](https://doi.org/10.26552/com.C.2020.2.107-114)

### Real options and growth

- Freitag, B., Häfner, L., Pfeuffer, V., & Übelhör, J. (2020). Evaluating investments in flexible on-demand production capacity: A real options approach. Business Research, 13, 133–161. [https://doi.org/10.1007/s40685-019-00105-w](https://doi.org/10.1007/s40685-019-00105-w)
- de Neufville, R., Scholtes, S., & Wang, T. (2006). Real options by spreadsheet: parking garage case example. Journal of Infrastructure Systems, 12(3), 107–111. [https://doi.org/10.1061/(ASCE)1076-0342(2006)12:2(107)](https://doi.org/10.1061/(ASCE)1076-0342(2006)12:2(107))

### Books and handbooks (no DOI link, library copy)

- Allen, A. O. (1990). Probability, Statistics and Queueing Theory with Computer Science Applications (2nd ed.). Academic Press. (Library copy; no DOI.)
- Kleinrock, L. (1976). Queueing Systems, Volume II: Computer Applications. Wiley-Interscience. (Library copy; no DOI.)
- Gross, D., Shortle, J. F., Thompson, J. M., & Harris, C. M. (2008). Fundamentals of Queueing Theory (4th ed.). Wiley. [https://doi.org/10.1002/9781118625651](https://doi.org/10.1002/9781118625651)
- Bartholdi, J. J., III, & Hackman, S. T. (2017). Warehouse & Distribution Science, Release 0.98. Georgia Tech. Open access: https://www.warehouse-science.com/book/editions/wh-sci-0.98.pdf
- Frazelle, E. World-Class Warehousing and Material Handling. McGraw-Hill (first edition 2001, 2nd edition 2016). (Library copy; no DOI.)
- Tompkins, J. A., White, J. A., Bozer, Y. A., & Tanchoco, J. M. A. (2010). Facilities Planning (4th ed.). Wiley. (Library copy; no DOI.)

### Not verified
- Lerher, T. (2016). Multi-tier shuttle-based storage and retrieval systems. FME Transactions, 44(3), 285-290. Not verified: no DOI record found.
- Li, G. & Gong, X. (2025). Shelf layout and equipment configuration of four-way shuttle warehouse. Journal of South China University of Technology (Natural Science), 53(3), 68-79. Not verified: no Crossref record; figures from it are not used as sourced values.
- Heskett, J. L. (1963). Cube-per-order index: a key to warehouse stock location. Transport and Distribution Management, 3, 27-31. Not verified; the rule is cited through Kallina and Lynn (1976) above.
- Kulwiec, R. (2007). Reliability of automated storage and retrieval systems (AS/RS), white paper. Not verified: no copy found; the 97.34 % figure is quoted via Lewczuk (2021).
- Eder, M. (2026). Analytical throughput modelling of a tier-to-tier SBS/RS, TU Wien repository record (title not verified): https://repositum.tuwien.at/handle/20.500.12708/231619

### Fire, safety, seismic and standards (titles only; the standards are paid or copyrighted)
- FM Global, Property Loss Prevention Data Sheets 8-9 (storage of Class 1-4 and plastic commodities) and 8-34 (protection for automatic storage and retrieval systems).
- EN 12845, Fixed firefighting systems - Automatic sprinkler systems - Design, installation and maintenance. EN 16750, Fixed firefighting systems - Oxygen reduction systems.
- Ministero dell'Interno, DM 3/8/2015, Codice di prevenzione incendi: https://www.vigilfuoco.it . UNI 10779:2021 (hydrant networks). VdS 3527 (oxygen reduction) and VdS CEA 4001 (sprinklers). NFPA 13.
- EN 15620 (steel static storage systems, tolerances and clearances), EN 16681 (adjustable pallet racking, seismic design), EN 15512, EN 528 (rail dependent storage and retrieval equipment), EN ISO 14122-2.
- NTC 2018 (DM 17/01/2018); Regione Veneto DGR 244/2021 and the DICEA-UniPD seismic zoning of Veneto (zone 3 for Padova).
- D.Lgs. 81/2008, Allegato IV (workplace requirements). VDI 3581 (availability of transport and storage systems). FEM 9.222 (availability, open scan): https://www.fem-eur.com/wp-content/uploads/2016/03/FEM-9_222_Englisch.pdf
- Directive 96/53/EC, Annex I (EU vehicle dimensions): https://www.legislation.gov.uk/eudr/1996/53/annexes/data.pdf

### Vendor, cost and energy data (public pages, used as parameter anchors, marked as assumptions in the model)
- Blue Giant, Dock Design Guide 2026: https://www.bluegiant.com/getmedia/367f0058-ec36-41ba-b0c2-93afb9367d51/Blue-Giant-Dock-Design-Guide-2026.pdf
- Cisco-Eagle (2021), pallet rack clearances: https://www.cisco-eagle.com/blog/2021/05/11/pallet-rack-clearances-lateral-vertical-and-building-structures
- Mecalux, Semi-automated Pallet Shuttle System catalogue: https://www.mecalux.com/catalogues/pallet-shuttle3.1.1.pdf
- SSI Schaefer, Pallet Roaming Shuttle factsheet: https://www.ssi-schaefer.com/resource/blob/2008638/206ca186151c27aec247b3289ab6f7e3/ssi-pallet-roaming-shuttle-factsheet-apac-data.pdf
- Dexion / Constructor, Pallet shuttle system brochure: https://www.constructor.se/globalassets/download/productcatalogues/international/pallet-shuttle-system.pdf
- TGW, availability guarantee: https://www.tgw-group.com/en/news/detail/tgw-availability-guarantee/
- Cronoshare (2026), building cost in Italy: https://www.cronoshare.it/quanto-costa/costruire-capannone-industriale
- Eurostat dataset nrg_pc_205 (electricity prices): https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_205
- ISPRA R 413/2025, Le emissioni di CO2 nel settore elettrico: https://emissioni.sina.isprambiente.it/wp-content/uploads/2025/05/Le-emissioni-di-CO2-nel-settore-elettrico_r413-2025_def.pdf
- Single vendor snippets, market listings, a blog page whose link is dead and a dock blog whose figures were not found are not used as sources.

## Licence and third-party notices
Our own code and texts: all rights reserved, see `LICENSE`. Third-party libraries are loaded from public CDNs and are not redistributed here: see `THIRD_PARTY_NOTICES.md`.
