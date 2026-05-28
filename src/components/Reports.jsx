import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Share2, 
  Mail, 
  MessageSquare, 
  Calendar, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Check, 
  X as XIcon, 
  Info 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';


export default function Reports({ staffList, eventsList, contributionsList, expensesList }) {
  const [activeTab, setActiveTab] = useState('single');
  
  // Single Event state
  const [singleEventId, setSingleEventId] = useState('');
  
  // Custom Range state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ----------------------------------------------------
  // SINGLE EVENT REPORT CALCULATIONS
  // ----------------------------------------------------
  const singleEventObj = eventsList.find(e => e.id === singleEventId);
  const singleEventContribs = contributionsList.filter(c => c.eventId === singleEventId);
  const singleEventExpenses = expensesList.filter(e => e.eventId === singleEventId);

  const singleExemptIds = singleEventObj?.exemptStaffIds || [];
  const singleTargetStaffCount = Math.max(1, staffList.length - singleExemptIds.length);
  
  const singleCollected = singleEventContribs
    .filter(c => c.paid)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  
  const singleSpent = singleEventExpenses
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  
  const singleNet = singleCollected - singleSpent;

  const singlePaidStaff = staffList
    .filter(s => !singleExemptIds.includes(s.id))
    .map(s => {
      const contrib = singleEventContribs.find(c => c.staffId === s.id);
      return {
        ...s,
        paid: !!contrib?.paid,
        amount: contrib?.amount || 0,
        date: contrib?.updatedAt ? new Date(contrib.updatedAt).toLocaleDateString() : '-'
      };
    })
    .filter(s => s.paid);

  const singleUnpaidStaff = staffList
    .filter(s => !singleExemptIds.includes(s.id))
    .map(s => {
      const contrib = singleEventContribs.find(c => c.staffId === s.id);
      return {
        ...s,
        paid: !!contrib?.paid,
        amount: contrib?.amount || 0
      };
    })
    .filter(s => !s.paid);

  // ----------------------------------------------------
  // CUSTOM RANGE REPORT CALCULATIONS
  // ----------------------------------------------------
  const getEventsInRange = () => {
    if (!startDate || !endDate) return [];
    return eventsList.filter(e => {
      // Direct string comparison is timezone-safe for YYYY-MM-DD formats
      return e.date >= startDate && e.date <= endDate;
    });
  };

  const eventsInRange = getEventsInRange();
  const rangeEventIds = eventsInRange.map(e => e.id);

  const rangeContributions = contributionsList.filter(c => rangeEventIds.includes(c.eventId));
  const rangeExpenses = expensesList.filter(e => rangeEventIds.includes(e.eventId));

  const rangeTotalCollected = rangeContributions
    .filter(c => c.paid)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const rangeTotalSpent = rangeExpenses
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const rangeNetBalance = rangeTotalCollected - rangeTotalSpent;

  // Compile cross-tab grid for staff paid status and totals in range
  const getStaffRangeSummaryList = () => {
    if (eventsInRange.length === 0) return [];
    
    return staffList.map(staff => {
      const eventSummary = {};
      let totalPaid = 0;
      let totalDue = 0;

      eventsInRange.forEach(event => {
        const isExempt = event.exemptStaffIds?.includes(staff.id);
        const contrib = rangeContributions.find(c => c.eventId === event.id && c.staffId === staff.id);
        
        if (isExempt) {
          eventSummary[event.id] = { status: 'exempt', amount: 0 };
        } else if (contrib?.paid) {
          eventSummary[event.id] = { status: 'paid', amount: Number(contrib.amount) };
          totalPaid += Number(contrib.amount);
        } else {
          eventSummary[event.id] = { status: 'unpaid', amount: 0 };
          totalDue += Number(event.targetAmount);
        }
      });

      return {
        id: staff.id,
        name: staff.name,
        employeeId: staff.employeeId,
        department: staff.section,
        eventSummary,
        totalPaid,
        totalDue
      };
    });
  };

  const staffRangeSummary = getStaffRangeSummaryList();

  // ----------------------------------------------------
  // SHARING HANDLERS
  // ----------------------------------------------------
  const generateReportSummaryText = () => {
    let text = `*Kilinochchi Central College - Guild Account Report*\n\n`;
    
    if (activeTab === 'single' && singleEventObj) {
      text += `*Event:* ${singleEventObj.name}\n`;
      text += `*Date:* ${singleEventObj.date}\n`;
      text += `-----------------------------------------\n`;
      text += `*Collected:* Rs. ${singleCollected.toLocaleString()}\n`;
      text += `*Expenses Spent:* Rs. ${singleSpent.toLocaleString()}\n`;
      text += `*Net Balance:* Rs. ${singleNet.toLocaleString()} (${singleNet >= 0 ? 'Surplus' : 'Deficit'})\n\n`;
      text += `*Payment Summary:*\n`;
      text += `- Paid Staff: ${singlePaidStaff.length} members\n`;
      text += `- Unpaid Staff: ${singleUnpaidStaff.length} members\n`;
      if (singleUnpaidStaff.length > 0) {
        text += `\n*Outstanding Payments From:*\n`;
        singleUnpaidStaff.forEach(s => {
          text += `- ${s.name} (${s.employeeId})\n`;
        });
      }
    } else if (activeTab === 'range' && eventsInRange.length > 0) {
      text += `*Date Range:* ${startDate} to ${endDate}\n`;
      text += `*Events Covered:* ${eventsInRange.map(e => e.name).join(', ')}\n`;
      text += `-----------------------------------------\n`;
      text += `*Total Collected:* Rs. ${rangeTotalCollected.toLocaleString()}\n`;
      text += `*Total Spent:* Rs. ${rangeTotalSpent.toLocaleString()}\n`;
      text += `*Net Balance:* Rs. ${rangeNetBalance.toLocaleString()} (${rangeNetBalance >= 0 ? 'Surplus' : 'Deficit'})\n\n`;
      
      // Top 5 outstanding staff
      const outstandingStaff = staffRangeSummary
        .filter(s => s.totalDue > 0)
        .sort((a, b) => b.totalDue - a.totalDue);

      if (outstandingStaff.length > 0) {
        text += `*Outstanding Staff Dues:*\n`;
        outstandingStaff.slice(0, 8).forEach(s => {
          text += `- ${s.name} (${s.employeeId}): Rs. ${s.totalDue.toLocaleString()} due\n`;
        });
        if (outstandingStaff.length > 8) {
          text += `... and ${outstandingStaff.length - 8} more.`;
        }
      }
    } else {
      text += `No report selected or search range empty.`;
    }
    return text;
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateReportSummaryText());
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(
      activeTab === 'single' && singleEventObj
        ? `School Guild Event Report - ${singleEventObj.name}`
        : `School Guild Financial Report [${startDate} to ${endDate}]`
    );
    const body = encodeURIComponent(generateReportSummaryText());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // ----------------------------------------------------
  // EXCEL EXPORT (CSV FORMAT GENERATION)
  // ----------------------------------------------------
  const handleExportExcel = () => {
    let csvContent = "";
    
    if (activeTab === 'single' && singleEventObj) {
      csvContent += `"Kilinochchi Central College - School Guild Account Management"\n`;
      csvContent += `"Event Report: ${singleEventObj.name}"\n`;
      csvContent += `"Event Date: ${singleEventObj.date}"\n\n`;
      
      csvContent += `"Financial Metrics"\n`;
      csvContent += `"Total Collected",Rs. ${singleCollected}\n`;
      csvContent += `"Total Spent",Rs. ${singleSpent}\n`;
      csvContent += `"Net Balance",Rs. ${singleNet}\n\n`;
      
      csvContent += `"Paid Staff Members"\n`;
      csvContent += `"Employee ID","Name","Amount Contributed","Payment Date"\n`;
      singlePaidStaff.forEach(s => {
        csvContent += `"${s.employeeId}","${s.name}","Rs. ${s.amount}","${s.date}"\n`;
      });
      csvContent += `\n`;
      
      csvContent += `"Unpaid Staff Members"\n`;
      csvContent += `"Employee ID","Name","Target Amount Due"\n`;
      singleUnpaidStaff.forEach(s => {
        csvContent += `"${s.employeeId}","${s.name}","Rs. ${singleEventObj.targetAmount}"\n`;
      });
    } else if (activeTab === 'range' && eventsInRange.length > 0) {
      csvContent += `"Kilinochchi Central College - School Guild Account Management"\n`;
      csvContent += `"Custom Range Financial Report: ${startDate} to ${endDate}"\n\n`;
      
      csvContent += `"Financial Summary"\n`;
      csvContent += `"Total Collected",Rs. ${rangeTotalCollected}\n`;
      csvContent += `"Total Spent",Rs. ${rangeTotalSpent}\n`;
      csvContent += `"Net Balance",Rs. ${rangeNetBalance}\n\n`;
      
      // Matrix Headers
      const eventHeaders = eventsInRange.map(e => `"${e.name} (Rs. ${e.targetAmount})"`).join(',');
      csvContent += `"Employee ID","Staff Name","Department",${eventHeaders},"Total Paid","Total Outstanding"\n`;
      
      staffRangeSummary.forEach(row => {
        const eventStatuses = eventsInRange.map(event => {
          const detail = row.eventSummary[event.id];
          if (detail.status === 'exempt') return `"Exempt"`;
          if (detail.status === 'paid') return `"Paid (Rs. ${detail.amount})"`;
          return `"Unpaid"`;
        }).join(',');
        
        csvContent += `"${row.employeeId}","${row.name}","${row.department}",${eventStatuses},"Rs. ${row.totalPaid}","Rs. ${row.totalDue}"\n`;
      });
    } else {
      alert("No report data available to export.");
      return;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", activeTab === 'single' ? `event_report_${singleEventObj?.name.replace(/\s+/g, '_')}.csv` : `guild_report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ----------------------------------------------------
  // PDF EXPORT (jsPDF & jsPDF-AutoTable Dynamic Loading)
  // ----------------------------------------------------
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Header Section
      doc.setFillColor(15, 23, 42); // deep navy
      doc.rect(0, 0, 210, 32, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.text("KILINOCHCHI CENTRAL COLLEGE", 14, 13);
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      doc.text("School Guild Account Management Report", 14, 23);
      
      let finalY = 40;

      if (activeTab === 'single' && singleEventObj) {
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(14);
        doc.setFont('Helvetica', 'bold');
        doc.text(`Event Report: ${singleEventObj.name}`, 14, finalY);
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Event Date: ${singleEventObj.date}`, 14, finalY + 6);
        
        // Summary Metrics Cards in PDF
        doc.setFillColor(248, 250, 252);
        doc.rect(14, finalY + 12, 182, 22, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, finalY + 12, 182, 22, 'S');
        
        doc.setFont('Helvetica', 'bold');
        doc.text("Collected: ", 20, finalY + 20);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Rs. ${singleCollected.toLocaleString()}`, 42, finalY + 20);

        doc.setFont('Helvetica', 'bold');
        doc.text("Spent: ", 20, finalY + 27);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Rs. ${singleSpent.toLocaleString()}`, 35, finalY + 27);

        doc.setFont('Helvetica', 'bold');
        doc.text("Net Balance: ", 90, finalY + 20);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Rs. ${singleNet.toLocaleString()} (${singleNet >= 0 ? 'Surplus' : 'Deficit'})`, 116, finalY + 20);
        
        // Add Paid List
        const paidRows = singlePaidStaff.map(s => [s.employeeId, s.name, `Rs. ${s.amount}`, s.date]);
        doc.setFont('Helvetica', 'bold');
        doc.text("Paid Contributions List", 14, finalY + 44);
        
        autoTable(doc, {
          startY: finalY + 48,
          head: [['Employee ID', 'Staff Name', 'Amount Contributed', 'Payment Date']],
          body: paidRows,
          theme: 'striped',
          headStyles: { fillColor: [37, 99, 235] }
        });
        
        // Add Unpaid List
        finalY = doc.previousAutoTable.finalY + 12;
        const unpaidRows = singleUnpaidStaff.map(s => [s.employeeId, s.name, `Rs. ${singleEventObj.targetAmount}`]);
        doc.setFont('Helvetica', 'bold');
        doc.text("Unpaid Staff List", 14, finalY);
        
        autoTable(doc, {
          startY: finalY + 4,
          head: [['Employee ID', 'Staff Name', 'Target Amount Due']],
          body: unpaidRows,
          theme: 'striped',
          headStyles: { fillColor: [220, 38, 38] }
        });

      } else if (activeTab === 'range' && eventsInRange.length > 0) {
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(14);
        doc.setFont('Helvetica', 'bold');
        doc.text(`Custom Range Financial Report`, 14, finalY);
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Timeline: ${startDate} to ${endDate}`, 14, finalY + 6);
        
        // Range Summary Metrics
        doc.setFillColor(248, 250, 252);
        doc.rect(14, finalY + 12, 182, 22, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, finalY + 12, 182, 22, 'S');
        
        doc.setFont('Helvetica', 'bold');
        doc.text("Total Collected: ", 20, finalY + 20);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Rs. ${rangeTotalCollected.toLocaleString()}`, 50, finalY + 20);

        doc.setFont('Helvetica', 'bold');
        doc.text("Total Spent: ", 20, finalY + 27);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Rs. ${rangeTotalSpent.toLocaleString()}`, 43, finalY + 27);

        doc.setFont('Helvetica', 'bold');
        doc.text("Net Account Balance: ", 100, finalY + 20);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Rs. ${rangeNetBalance.toLocaleString()}`, 142, finalY + 20);

        // Add Matrix Table
        const headers = ['Staff Name', 'ID', ...eventsInRange.map(e => e.name.substring(0, 15)), 'Paid', 'Due'];
        const bodyRows = staffRangeSummary.map(row => {
          const cells = [
            row.name,
            row.employeeId
          ];
          eventsInRange.forEach(e => {
            const sum = row.eventSummary[e.id] || { status: 'unpaid', amount: 0 };
            if (sum.status === 'exempt') cells.push('Exempt');
            else if (sum.status === 'paid') cells.push(`Rs.${sum.amount}`);
            else cells.push('Unpaid');
          });
          cells.push(`Rs.${row.totalPaid}`);
          cells.push(`Rs.${row.totalDue}`);
          return cells;
        });

        doc.setFont('Helvetica', 'bold');
        doc.text("Event-wise Contributions Summary", 14, finalY + 44);
        
        autoTable(doc, {
          startY: finalY + 48,
          head: [headers],
          body: bodyRows,
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
          styles: { fontSize: 7 }
        });

        // Add Outstanding Dues Table in Custom Range PDF
        finalY = doc.previousAutoTable.finalY + 12;
        const outstandingRows = staffRangeSummary
          .filter(s => s.totalDue > 0)
          .sort((a, b) => b.totalDue - a.totalDue)
          .map(s => [s.employeeId, s.name, s.department, `Rs. ${s.totalPaid}`, `Rs. ${s.totalDue}`]);
          
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.text("Outstanding Dues Summary (Unpaid Members)", 14, finalY);
        
        autoTable(doc, {
          startY: finalY + 4,
          head: [['Employee ID', 'Staff Name', 'Department', 'Total Paid', 'Total Outstanding']],
          body: outstandingRows,
          theme: 'striped',
          headStyles: { fillColor: [220, 38, 38] }
        });
      } else {
        alert("Please configure date range filters to export PDF.");
        return;
      }
      
      doc.save(activeTab === 'single' ? 'guild_single_event_report.pdf' : 'guild_range_report.pdf');
    } catch (err) {
      console.error("PDF engine crash, fallback to manual alert:", err);
      alert("PDF library is importing or downloading in background. Please try again in 5 seconds.");
    }
  };

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="page-title">Financial Reports</h1>
          <p className="page-subtitle">Generate event specific audits, calculate custom range ledger mappings, and export records</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-nav">
        <button 
          onClick={() => { setActiveTab('single'); setSingleEventId(''); }}
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
        >
          Single Event Report
        </button>
        <button 
          onClick={() => { setActiveTab('range'); setStartDate(''); setEndDate(''); }}
          className={`tab-btn ${activeTab === 'range' ? 'active' : ''}`}
        >
          Custom Date Range Report
        </button>
      </div>

      {/* ==========================================
         TAB 1: SINGLE EVENT REPORT
         ========================================== */}
      {activeTab === 'single' && (
        <div>
          {/* Select Event Filter */}
          <div className="report-filter-bar">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Select Event for Audit</label>
              <select 
                value={singleEventId} 
                onChange={(e) => setSingleEventId(e.target.value)}
                className="form-control"
              >
                <option value="">-- Choose Guild Event --</option>
                {eventsList.map(event => (
                  <option key={event.id} value={event.id}>{event.name} ({event.date})</option>
                ))}
              </select>
            </div>
            
            {singleEventId && (
              <div className="report-actions" style={{ marginBottom: 0 }}>
                <button onClick={handleExportExcel} className="btn btn-secondary">
                  <Download size={14} /> Excel (CSV)
                </button>
                <button onClick={handleExportPDF} className="btn btn-secondary">
                  <FileText size={14} /> PDF Report
                </button>
                <button onClick={handleShareWhatsApp} className="btn btn-secondary" style={{ color: '#25D366' }}>
                  <MessageSquare size={14} /> WhatsApp Share
                </button>
                <button onClick={handleShareEmail} className="btn btn-secondary" style={{ color: 'var(--primary)' }}>
                  <Mail size={14} /> Email Report
                </button>
              </div>
            )}
          </div>

          {singleEventObj ? (
            <div>
              {/* Stats overview */}
              <div className="stats-grid">
                <div className="stat-card success">
                  <div className="stat-header">
                    <span>Collected</span>
                    <div className="stat-icon" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)' }}>
                      <TrendingUp size={20} />
                    </div>
                  </div>
                  <div className="stat-value">Rs. {singleCollected.toLocaleString()}</div>
                  <div className="stat-footer">
                    <span>Expected: Rs. {(singleEventObj.targetAmount * singleTargetStaffCount).toLocaleString()}</span>
                  </div>
                </div>

                <div className="stat-card danger">
                  <div className="stat-header">
                    <span>Spent Expenses</span>
                    <div className="stat-icon" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}>
                      <TrendingDown size={20} />
                    </div>
                  </div>
                  <div className="stat-value">Rs. {singleSpent.toLocaleString()}</div>
                  <div className="stat-footer">
                    <span>From logged receipts</span>
                  </div>
                </div>

                <div className="stat-card" style={{ borderColor: singleNet >= 0 ? 'var(--success-border)' : 'var(--danger-border)' }}>
                  <div className="stat-header">
                    <span>Budget Balance</span>
                    <div className="stat-icon" style={{ 
                      color: singleNet >= 0 ? 'var(--success)' : 'var(--danger)', 
                      backgroundColor: singleNet >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)' 
                    }}>
                      <DollarSign size={20} />
                    </div>
                  </div>
                  <div className="stat-value" style={{ color: singleNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    Rs. {singleNet.toLocaleString()}
                  </div>
                  <div className="stat-footer">
                    <span>{singleNet >= 0 ? 'Remaining Balance Left' : 'Shortage / Deficit'}</span>
                  </div>
                </div>
              </div>

              {/* Lists Split side-by-side */}
              <div className="reports-lists-grid">
                {/* Paid table */}
                <div className="card-table-wrapper">
                  <div className="table-header-bar" style={{ backgroundColor: 'var(--success-bg)', borderBottomColor: 'var(--success-border)' }}>
                    <h3 className="table-title" style={{ color: 'var(--success)' }}>Paid Staff Members ({singlePaidStaff.length})</h3>
                  </div>
                  <div className="custom-table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Contributed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {singlePaidStaff.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>No payments collected yet.</td>
                          </tr>
                        ) : (
                          singlePaidStaff.map(s => (
                            <tr key={s.id}>
                              <td style={{ color: 'var(--primary)', fontWeight: '600' }}>{s.employeeId}</td>
                              <td>{s.name}</td>
                              <td style={{ fontWeight: '600', color: 'var(--success)' }}>Rs. {s.amount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Unpaid table */}
                <div className="card-table-wrapper">
                  <div className="table-header-bar" style={{ backgroundColor: 'var(--danger-bg)', borderBottomColor: 'var(--danger-border)' }}>
                    <h3 className="table-title" style={{ color: 'var(--danger)' }}>Unpaid Staff Members ({singleUnpaidStaff.length})</h3>
                  </div>
                  <div className="custom-table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Amount Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {singleUnpaidStaff.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ textAlign: 'center', color: 'var(--success)', padding: '16px' }}>All active members paid! Excellent.</td>
                          </tr>
                        ) : (
                          singleUnpaidStaff.map(s => (
                            <tr key={s.id}>
                              <td style={{ color: 'var(--danger)', fontWeight: '600' }}>{s.employeeId}</td>
                              <td>{s.name}</td>
                              <td style={{ fontWeight: '600', color: 'var(--warn)' }}>Rs. {singleEventObj.targetAmount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="widget-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a guild event from the dropdown to run financial audits and export reports.
            </div>
          )}
        </div>
      )}

      {/* ==========================================
         TAB 2: CUSTOM RANGE REPORT
         ========================================== */}
      {activeTab === 'range' && (
        <div>
          {/* Select Date Range Filter */}
          <div className="report-filter-bar" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Start Date</label>
              <input 
                type="date" 
                className="form-control" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">End Date</label>
              <input 
                type="date" 
                className="form-control" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {eventsInRange.length > 0 && (
              <div className="report-actions" style={{ marginBottom: 0 }}>
                <button onClick={handleExportExcel} className="btn btn-secondary">
                  <Download size={14} /> Excel (CSV)
                </button>
                <button onClick={handleExportPDF} className="btn btn-secondary">
                  <FileText size={14} /> PDF Report
                </button>
                <button onClick={handleShareWhatsApp} className="btn btn-secondary" style={{ color: '#25D366' }}>
                  <MessageSquare size={14} /> WhatsApp Share
                </button>
                <button onClick={handleShareEmail} className="btn btn-secondary" style={{ color: 'var(--primary)' }}>
                  <Mail size={14} /> Email Report
                </button>
              </div>
            )}
          </div>

          {startDate && endDate && eventsInRange.length === 0 && (
            <div className="alert-banner">
              <Info size={16} />
              <span>No guild events were found in the timeline from {startDate} to {endDate}. Adjust dates to generate report.</span>
            </div>
          )}

          {eventsInRange.length > 0 ? (
            <div>
              {/* Financial Metrics */}
              <div className="stats-grid">
                <div className="stat-card success">
                  <div className="stat-header">
                    <span>Range Collected</span>
                    <div className="stat-icon" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)' }}>
                      <TrendingUp size={20} />
                    </div>
                  </div>
                  <div className="stat-value">Rs. {rangeTotalCollected.toLocaleString()}</div>
                  <div className="stat-footer">
                    <span>Across {eventsInRange.length} events</span>
                  </div>
                </div>

                <div className="stat-card danger">
                  <div className="stat-header">
                    <span>Range Spent</span>
                    <div className="stat-icon" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}>
                      <TrendingDown size={20} />
                    </div>
                  </div>
                  <div className="stat-value">Rs. {rangeTotalSpent.toLocaleString()}</div>
                  <div className="stat-footer">
                    <span>Total expenses in range</span>
                  </div>
                </div>

                <div className="stat-card" style={{ borderColor: rangeNetBalance >= 0 ? 'var(--success-border)' : 'var(--danger-border)' }}>
                  <div className="stat-header">
                    <span>Timeline Net Balance</span>
                    <div className="stat-icon" style={{ 
                      color: rangeNetBalance >= 0 ? 'var(--success)' : 'var(--danger)', 
                      backgroundColor: rangeNetBalance >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)' 
                    }}>
                      <DollarSign size={20} />
                    </div>
                  </div>
                  <div className="stat-value" style={{ color: rangeNetBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    Rs. {rangeNetBalance.toLocaleString()}
                  </div>
                  <div className="stat-footer">
                    <span>{rangeNetBalance >= 0 ? 'Total Net Surplus' : 'Total Net Deficit'}</span>
                  </div>
                </div>
              </div>

              {/* Cross-tab / Matrix Grid */}
              <div className="card-table-wrapper">
                <div className="table-header-bar">
                  <h3 className="table-title">Event Matrix Analysis (Staff-wise details)</h3>
                </div>
                
                <div className="custom-table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Staff Member</th>
                        {eventsInRange.map(event => (
                          <th key={event.id} style={{ fontSize: '0.75rem', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {event.name}
                          </th>
                        ))}
                        <th>Total Paid</th>
                        <th>Total Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffRangeSummary.map(row => (
                        <tr key={row.id}>
                          <td>
                            <div style={{ fontWeight: '500' }}>{row.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.employeeId}</div>
                          </td>
                          {eventsInRange.map(event => {
                             const statusObj = row.eventSummary[event.id] || { status: 'unpaid', amount: 0 };
                             return (
                               <td key={event.id}>
                                 {statusObj.status === 'exempt' ? (
                                  <span className="badge badge-warn" style={{ transform: 'scale(0.85)', padding: '2px 6px', fontSize: '0.65rem' }}>Exempt</span>
                                ) : statusObj.status === 'paid' ? (
                                  <span className="badge badge-success" style={{ transform: 'scale(0.85)', padding: '2px 6px', fontSize: '0.65rem' }}>Rs. {statusObj.amount}</span>
                                ) : (
                                  <span className="badge badge-danger" style={{ transform: 'scale(0.85)', padding: '2px 6px', fontSize: '0.65rem' }}>Unpaid</span>
                                )}
                              </td>
                            );
                          })}
                          <td style={{ fontWeight: '700', color: 'var(--success)' }}>
                            Rs. {row.totalPaid.toLocaleString()}
                          </td>
                          <td style={{ fontWeight: '700', color: row.totalDue > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                            Rs. {row.totalDue.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Outstanding Dues Summary */}
              <div className="card-table-wrapper" style={{ marginTop: '32px' }}>
                <div className="table-header-bar" style={{ backgroundColor: 'var(--danger-bg)', borderBottomColor: 'var(--danger-border)' }}>
                  <h3 className="table-title" style={{ color: 'var(--danger)' }}>Outstanding Dues Summary (Unpaid Members)</h3>
                </div>
                <div className="custom-table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Employee ID</th>
                        <th>Staff Name</th>
                        <th>Department</th>
                        <th>Total Paid (in Range)</th>
                        <th>Total Outstanding Dues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffRangeSummary.filter(s => s.totalDue > 0).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--success)', padding: '16px' }}>All active members paid for all events in this range! Excellent.</td>
                        </tr>
                      ) : (
                        staffRangeSummary
                          .filter(s => s.totalDue > 0)
                          .sort((a, b) => b.totalDue - a.totalDue)
                          .map(s => (
                            <tr key={s.id}>
                              <td style={{ color: 'var(--primary)', fontWeight: '600' }}>{s.employeeId}</td>
                              <td style={{ fontWeight: '500' }}>{s.name}</td>
                              <td>{s.department}</td>
                              <td style={{ color: 'var(--success)', fontWeight: '600' }}>Rs. {s.totalPaid.toLocaleString()}</td>
                              <td style={{ color: 'var(--danger)', fontWeight: '700' }}>Rs. {s.totalDue.toLocaleString()}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="widget-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Set a valid start and end date range above to load events and generate cross-tab matrix audits.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
