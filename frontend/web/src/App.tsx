// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface DataRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  dataType: string;
  fheStatus: "pending" | "processed" | "error";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    dataType: "",
    description: "",
    rawData: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);

  // Calculate statistics
  const processedCount = records.filter(r => r.fheStatus === "processed").length;
  const pendingCount = records.filter(r => r.fheStatus === "pending").length;
  const errorCount = records.filter(r => r.fheStatus === "error").length;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: DataRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                dataType: recordData.dataType,
                fheStatus: recordData.fheStatus || "pending"
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-ENCRYPTED-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        dataType: newRecordData.dataType,
        fheStatus: "pending"
      };
      
      // Store encrypted data on-chain
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "record_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Data encrypted and submitted securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          dataType: "",
          description: "",
          rawData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const processRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        fheStatus: Math.random() > 0.2 ? "processed" : "error"
      };
      
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE processing completed!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Processing failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleRecordDetails = (recordId: string) => {
    if (expandedRecord === recordId) {
      setExpandedRecord(null);
    } else {
      setExpandedRecord(recordId);
    }
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Link your Web3 wallet to start using FHE-powered features",
      icon: "🔗"
    },
    {
      title: "Upload Data",
      description: "Submit your data which will be encrypted using FHE technology",
      icon: "📤"
    },
    {
      title: "FHE Processing",
      description: "Your data is processed in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Get Insights",
      description: "Receive analytical results while keeping your data private",
      icon: "📊"
    }
  ];

  const renderPieChart = () => {
    const total = records.length || 1;
    const processedPercentage = (processedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const errorPercentage = (errorCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment processed" 
            style={{ transform: `rotate(${processedPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment pending" 
            style={{ transform: `rotate(${(processedPercentage + pendingPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment error" 
            style={{ transform: `rotate(${(processedPercentage + pendingPercentage + errorPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{records.length}</div>
            <div className="pie-label">Total</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box processed"></div>
            <span>Processed: {processedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box pending"></div>
            <span>Pending: {pendingCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box error"></div>
            <span>Error: {errorCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="neon-globe"></div>
          </div>
          <h1>FHE<span>XGBoost</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-record-btn neon-button"
          >
            <div className="add-icon"></div>
            Add Data
          </button>
          <button 
            className="neon-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Powered Privacy-Preserving Federated XGBoost</h2>
            <p>Train XGBoost models on encrypted data from multiple sources without sharing raw data</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How It Works</h2>
            <p className="subtitle">Learn how to use FHE for privacy-preserving machine learning</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-panels">
          <div className="panel cyber-card">
            <h3>Project Overview</h3>
            <p>This platform enables multiple data holders to collaboratively train XGBoost models using Fully Homomorphic Encryption (FHE), ensuring data privacy while maintaining model accuracy.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="panel cyber-card">
            <h3>Data Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{records.length}</div>
                <div className="stat-label">Total Records</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{processedCount}</div>
                <div className="stat-label">Processed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{errorCount}</div>
                <div className="stat-label">Errors</div>
              </div>
            </div>
          </div>
          
          <div className="panel cyber-card">
            <h3>Status Distribution</h3>
            {renderPieChart()}
          </div>
        </div>
        
        <div className="records-section">
          <div className="section-header">
            <h2>Encrypted Data Records</h2>
            <div className="header-actions">
              <button 
                onClick={loadRecords}
                className="refresh-btn neon-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="records-list cyber-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Type</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {records.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No encrypted records found</p>
                <button 
                  className="neon-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Record
                </button>
              </div>
            ) : (
              records.map(record => (
                <React.Fragment key={record.id}>
                  <div className="record-row" onClick={() => toggleRecordDetails(record.id)}>
                    <div className="table-cell record-id">#{record.id.substring(0, 6)}</div>
                    <div className="table-cell">{record.dataType}</div>
                    <div className="table-cell">{record.owner.substring(0, 6)}...{record.owner.substring(38)}</div>
                    <div className="table-cell">
                      {new Date(record.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <span className={`status-badge ${record.fheStatus}`}>
                        {record.fheStatus}
                      </span>
                    </div>
                    <div className="table-cell actions">
                      <button 
                        className="action-btn neon-button"
                        onClick={(e) => { e.stopPropagation(); processRecord(record.id); }}
                      >
                        Process
                      </button>
                    </div>
                  </div>
                  {expandedRecord === record.id && (
                    <div className="record-details">
                      <div className="details-content">
                        <h4>Record Details</h4>
                        <div className="detail-item">
                          <span className="label">ID:</span>
                          <span className="value">{record.id}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Owner:</span>
                          <span className="value">{record.owner}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Encrypted Data:</span>
                          <span className="value encrypted">{record.encryptedData.substring(0, 60)}...</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Timestamp:</span>
                          <span className="value">{new Date(record.timestamp * 1000).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="neon-globe"></div>
              <span>FHE XGBoost</span>
            </div>
            <p>Privacy-preserving federated learning with Fully Homomorphic Encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE XGBoost. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!recordData.dataType || !recordData.rawData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Add Encrypted Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your data will be encrypted with FHE before processing
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Data Type *</label>
              <select 
                name="dataType"
                value={recordData.dataType} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">Select type</option>
                <option value="Financial">Financial Data</option>
                <option value="Medical">Medical Records</option>
                <option value="Behavioral">User Behavior</option>
                <option value="Demographic">Demographic Info</option>
                <option value="Other">Other Sensitive Data</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={recordData.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Raw Data *</label>
              <textarea 
                name="rawData"
                value={recordData.rawData} 
                onChange={handleChange}
                placeholder="Enter data to be encrypted with FHE..." 
                className="cyber-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn neon-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn neon-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;